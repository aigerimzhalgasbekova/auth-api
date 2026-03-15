import { APIGatewayEvent } from 'aws-lambda';
import {
    KMSClient,
    SignCommand,
    SigningAlgorithmSpec,
    MessageType,
} from '@aws-sdk/client-kms';
import base64url from 'base64url';
import crypto from 'crypto';

interface AuthorizationRequest {
    response_type: string;
    client_id: string;
    state?: string;
    scope?: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
}

interface AuthorizationCodePayload {
    client_id: string;
    redirect_uri: string;
    scope?: string;
    code_challenge: string;
    code_challenge_method: string;
    exp: number;
    iat: number;
    jti: string; // Unique identifier for the code
}

interface TokenComponents {
    header: string;
    payload: string;
    signature?: string;
}

export const handler = async (event: APIGatewayEvent) => {
    console.debug(`Authorization request: ${JSON.stringify(event)}`);

    try {
        // Parse query parameters
        const queryParams = event.queryStringParameters || {};

        // Validate required parameters
        const validationResult = validateAuthorizationRequest(queryParams);
        if (!validationResult.valid) {
            return {
                isBase64Encoded: false,
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'invalid_request',
                    error_description: validationResult.message,
                }),
            };
        }

        const authRequest = validationResult.request as AuthorizationRequest;

        // Generate authorization code as self-encoded token
        const authorizationCode = await generateAuthorizationCode(authRequest);

        // Build redirect URL
        const redirectUrl = buildRedirectUrl(
            authRequest.redirect_uri,
            authorizationCode,
            authRequest.state,
        );

        return {
            isBase64Encoded: false,
            statusCode: 302,
            headers: {
                Location: redirectUrl,
            },
            body: '',
        };
    } catch (error) {
        console.error(
            `Error processing authorization request: ${error}`,
            error,
        );
        return {
            isBase64Encoded: false,
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'server_error',
                error_description: 'Internal server error',
            }),
        };
    }
};

const validateAuthorizationRequest = (
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    params: any,
): { valid: boolean; message?: string; request?: AuthorizationRequest } => {
    // Check required parameters
    const requiredParams = [
        'response_type',
        'client_id',
        'redirect_uri',
        'code_challenge',
        'code_challenge_method',
    ];

    for (const param of requiredParams) {
        if (!params[param]) {
            return {
                valid: false,
                message: `Missing required parameter: ${param}`,
            };
        }
    }

    // Validate response_type
    if (params.response_type !== 'code') {
        return {
            valid: false,
            message: 'response_type must be "code"',
        };
    }

    // Only S256 is accepted per RFC 7636 security recommendations
    if (params.code_challenge_method !== 'S256') {
        return {
            valid: false,
            message: 'code_challenge_method must be "S256"',
        };
    }

    // Validate code_challenge format (S256: base64url encoded SHA256 hash)
    const base64urlRegex = /^[A-Za-z0-9_-]+$/;
    if (
        !base64urlRegex.test(params.code_challenge) ||
        params.code_challenge.length !== 43
    ) {
        return {
            valid: false,
            message:
                'code_challenge must be base64url encoded SHA256 hash (43 characters)',
        };
    }

    // TODO: validate redirect_uri against registered URIs per client_id (RFC 6749 §3.1.2.3)
    try {
        new URL(params.redirect_uri);
    } catch {
        return {
            valid: false,
            message: 'Invalid redirect_uri format',
        };
    }

    return {
        valid: true,
        request: {
            response_type: params.response_type,
            client_id: params.client_id,
            state: params.state,
            scope: params.scope,
            redirect_uri: params.redirect_uri,
            code_challenge: params.code_challenge,
            code_challenge_method: params.code_challenge_method,
        },
    };
};

const generateAuthorizationCode = async (
    authRequest: AuthorizationRequest,
): Promise<string> => {
    const kmsKeyAliasName = process.env.KMS_KEY_ALIAS_NAME;
    if (!kmsKeyAliasName) {
        throw new Error('KMS_KEY_ALIAS_NAME environment variable is required');
    }

    // Create JWT components for authorization code
    const headers = {
        alg: 'PS256',
        typ: 'JWT',
        kid: kmsKeyAliasName,
    };

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const payload: AuthorizationCodePayload = {
        client_id: authRequest.client_id,
        redirect_uri: authRequest.redirect_uri,
        scope: authRequest.scope,
        code_challenge: authRequest.code_challenge,
        code_challenge_method: authRequest.code_challenge_method,
        iat: nowInSeconds,
        exp: nowInSeconds + 600, // 10 minutes expiration as per OAuth 2.0 spec
        jti: crypto.randomBytes(16).toString('hex'), // TODO: enforce single-use via persistence when /token endpoint is implemented (RFC 6749 §4.1.2)
    };

    const tokenComponents: TokenComponents = {
        header: base64url(JSON.stringify(headers)),
        payload: base64url(JSON.stringify(payload)),
    };

    const message = Buffer.from(
        tokenComponents.header + '.' + tokenComponents.payload,
    );

    const kmsClient = new KMSClient({});
    const signParams = {
        KeyId: kmsKeyAliasName,
        Message: message,
        MessageType: MessageType.RAW,
        SigningAlgorithm: SigningAlgorithmSpec.RSASSA_PSS_SHA_256,
    };

    const signResponse = await kmsClient.send(new SignCommand(signParams));
    if (!signResponse.Signature) {
        throw new Error('Failed to sign authorization code');
    }

    tokenComponents.signature = base64url.encode(
        Buffer.from(signResponse.Signature),
    );

    // Authorization code is a JWT token
    const authorizationCode =
        tokenComponents.header +
        '.' +
        tokenComponents.payload +
        '.' +
        tokenComponents.signature;

    return authorizationCode;
};

const buildRedirectUrl = (
    redirectUri: string,
    code: string,
    state?: string,
): string => {
    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    if (state) {
        url.searchParams.set('state', state);
    }
    return url.toString();
};
