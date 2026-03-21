import {
    KMSClient,
    MessageType,
    SignCommand,
    SigningAlgorithmSpec,
} from '@aws-sdk/client-kms';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { getValidatedCredentials } from './validator';
import { verifyPassword } from './password';
import { APIGatewayEvent } from 'aws-lambda';

interface ITokenComponents {
    header: string;
    payload: string;
    signature?: string;
}

const kmsClient = new KMSClient({});
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayEvent) => {
    try {
        // get the user credentials from the Authorization header
        const { valid, username, password, message } = getValidatedCredentials(
            event.headers,
        );
        if (!valid) {
            console.error(`Invalid credentials: ${message}`);
            return {
                isBase64Encoded: false,
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Bad request' }),
            };
        }

        // check if the user exists in the database and verify password
        const user = await findUser(username!);
        if (
            !user ||
            !(await verifyPassword(password!, user.password_hash as string))
        ) {
            return {
                isBase64Encoded: false,
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Invalid credentials' }),
            };
        }

        // issue a JWT token
        return await sign(username!);
    } catch (error) {
        console.error(`Error while processing the request: ${error}`, error);
        return {
            isBase64Encoded: false,
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Internal server error' }),
        };
    }
};

const findUser = async (username: string) => {
    const response = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.USER_CREDENTIALS_TABLE,
            Key: { Username: username },
        }),
    );
    return response.Item ?? null;
};

const sign = async (username: string) => {
    const kmsKeyAliasName = process.env.KMS_KEY_ALIAS_NAME;

    // create JWT components
    const headers = {
        alg: 'PS256',
        typ: 'JWT',
        kid: kmsKeyAliasName,
    };
    const nowInSeconds = new Date().getTime() / 1000;
    const payload = {
        user_name: username,
        iss: process.env.TOKEN_ISSUER || 'https://example.com',
        iat: Math.floor(nowInSeconds),
        // hardcoded 1 hour expiration, could be set as an environment variable
        exp: Math.floor(nowInSeconds + 3600),
        // there could be added more claims e.g roles, permissions, etc.
    };

    const tokenComponents: ITokenComponents = {
        header: Buffer.from(JSON.stringify(headers)).toString('base64url'),
        payload: Buffer.from(JSON.stringify(payload)).toString('base64url'),
    };
    const message = Buffer.from(
        tokenComponents.header + '.' + tokenComponents.payload,
    );

    const signParams = {
        KeyId: kmsKeyAliasName,
        Message: message,
        MessageType: MessageType.RAW,
        // RSASSA_PSS is a more secure algorithm than RSASSA_PKCS1_V1_5 and preferred for new implementations
        SigningAlgorithm: SigningAlgorithmSpec.RSASSA_PSS_SHA_256,
    };
    const signResponse = await kmsClient.send(new SignCommand(signParams));
    if (!signResponse.Signature) {
        console.error('Error signing the token');
        return {
            isBase64Encoded: false,
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Internal server error' }),
        };
    }
    tokenComponents['signature'] = Buffer.from(signResponse.Signature).toString(
        'base64url',
    );
    // JWT token is a concatenation of header, payload and signature separated by dots
    const token =
        tokenComponents.header +
        '.' +
        tokenComponents.payload +
        '.' +
        tokenComponents.signature;
    return {
        isBase64Encoded: false,
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token }),
    };
};
