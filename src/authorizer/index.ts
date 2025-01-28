import {
    KMSClient,
    KMSInvalidSignatureException,
    SigningAlgorithmSpec,
    VerifyCommand,
    VerifyCommandInput,
} from '@aws-sdk/client-kms';
import {
    APIGatewayAuthorizerResult,
    APIGatewayTokenAuthorizerEvent,
    PolicyDocument,
} from 'aws-lambda';

export class UnauthorizedError extends Error {}

const JWT_PREFIX = 'Bearer ';

type JWTHeader = {
    alg:
        | 'RS256'
        | 'RS384'
        | 'RS512'
        | 'ES256'
        | 'ES384'
        | 'ES512'
        | 'PS256'
        | 'PS384'
        | 'PS512';
    typ: 'JWT';
    kid: string;
};
type JWTPayload = {
    user_name: string;
    iss: string;
    exp: number;
    iat: number;
};

export const handler = async (
    event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
    try {
        return await authorize(event);
    } catch (error) {
        console.error('rejecting invalid request access', error);
        if (error instanceof UnauthorizedError) {
            throw error;
        }
        if (error instanceof KMSInvalidSignatureException) {
            throw new UnauthorizedError('not authorized to access this service');
        }
        throw new Error('Unauthorized');
    }
};

const authorize = async (
    event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
    const { authorizationToken, methodArn } = event;
    const kmsKeyId = process.env.KMS_KEY_ALIAS_NAME;
    if (!kmsKeyId) {
        throw new UnauthorizedError('not authorized to access this service');
    }

    if (!authorizationToken || !authorizationToken.startsWith(JWT_PREFIX)) {
        throw new UnauthorizedError('not authorized to access this service');
    }

    const token = authorizationToken.replace(JWT_PREFIX, '');

    const [headerBase64, payloadBase64, signatureBase64] = token.split('.');

    const header: JWTHeader = JSON.parse(
        Buffer.from(headerBase64, 'base64').toString(),
    );
    const payload: JWTPayload = JSON.parse(
        Buffer.from(payloadBase64, 'base64').toString(),
    );
    console.debug('Decoded info', {
        header,
        payload,
        kmsKeyId,
    });
    //validate header and payload
    if (!header || header.kid !== kmsKeyId || header.typ !== 'JWT') {
        throw new UnauthorizedError('not authorized to access this service');
    }
    if (
        !payload ||
        !payload.user_name ||
        !payload.iss ||
        !payload.exp ||
        !payload.iat
    ) {
        throw new UnauthorizedError('not authorized to access this service');
    }

    // The signature is base64 encoded, so we need to decode it
    const signatureToVerify = Uint8Array.from(
        Buffer.from(signatureBase64, 'base64'),
    );

    const input: VerifyCommandInput = {
        KeyId: kmsKeyId,
        Message: Buffer.from(headerBase64 + '.' + payloadBase64),
        MessageType: 'RAW',
        Signature: Buffer.from(signatureToVerify),
        SigningAlgorithm: SigningAlgorithmSpec.RSASSA_PSS_SHA_256,
    };

    const kmsClient = new KMSClient({});
    const command = new VerifyCommand(input);
    const response = await kmsClient.send(command);

    if (!response.SignatureValid) {
        throw new UnauthorizedError('not authorized to access this service');
    }

    return {
        principalId: payload['user_name'],
        policyDocument: generatePolicy(methodArn),
        context: {
            ...payload,
        },
    };
};

// Helper function to generate an IAM policy
const generatePolicy = (methodArn: string): PolicyDocument => {
    return {
        Version: '2012-10-17',
        Statement: [
            {
                Action: 'execute-api:Invoke',
                Effect: 'Allow',
                Resource: methodArn,
            },
        ],
    };
};
