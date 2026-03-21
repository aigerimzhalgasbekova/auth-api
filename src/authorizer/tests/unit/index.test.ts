import {
    KMSClient,
    KMSInvalidSignatureException,
    VerifyCommand,
} from '@aws-sdk/client-kms';
import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler, UnauthorizedError } from '../../index';

process.env.KMS_KEY_ALIAS_NAME = 'alias/signing-key';

const kmsMock = mockClient(KMSClient);

const createTestToken = () => {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
        JSON.stringify({
            alg: 'RS256',
            typ: 'JWT',
            kid: 'alias/signing-key',
        }),
    ).toString('base64url');
    const payload = Buffer.from(
        JSON.stringify({
            user_name: 'admin',
            iss: 'https://example.com',
            iat: nowInSeconds,
            exp: nowInSeconds + 3600,
        }),
    ).toString('base64url');
    return { header, payload, token: `Bearer ${header}.${payload}.token` };
};

describe('handler', () => {
    let event: APIGatewayTokenAuthorizerEvent;

    beforeEach(() => {
        jest.clearAllMocks();
        kmsMock.reset();
        const { token } = createTestToken();
        event = {
            type: 'TOKEN',
            authorizationToken: token,
            methodArn:
                'arn:aws:execute-api:region:account-id:api-id/stage/verb/resource',
        };
    });

    it('should return the result of authorize function', async () => {
        kmsMock.on(VerifyCommand).resolves({
            SignatureValid: true,
        });

        const result = await handler(event);

        expect(result).toEqual(
            expect.objectContaining({
                principalId: 'admin',
                policyDocument: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Action: 'execute-api:Invoke',
                            Effect: 'Allow',
                            Resource: event.methodArn,
                        },
                    ],
                },
            }),
        );
        expect(result.context).toEqual(
            expect.objectContaining({
                user_name: 'admin',
                iss: 'https://example.com',
            }),
        );
        expect(kmsMock.calls().length).toBe(1);
        expect(kmsMock.call(0).args[0].input).toEqual({
            KeyId: 'alias/signing-key',
            Message: expect.any(Uint8Array),
            MessageType: 'RAW',
            Signature: expect.any(Uint8Array),
            SigningAlgorithm: 'RSASSA_PSS_SHA_256',
        });
    });

    it('should throw UnauthorizedError if JWT token verification fails', async () => {
        const unauthorizedError = new UnauthorizedError(
            'not authorized to access this service',
        );

        // when the signature verification fails the KMS command will throw KMSInvalidSignatureException
        kmsMock.on(VerifyCommand).rejects(
            new KMSInvalidSignatureException({
                $metadata: {
                    httpStatusCode: 400,
                },
                message: 'Invalid signature',
            }),
        );

        await expect(handler(event)).rejects.toThrow(unauthorizedError);
        expect(kmsMock.calls().length).toBe(1);
    });

    it('should throw unexpected error if KMS command returns error', async () => {
        const genericError = new Error('Unauthorized');
        kmsMock.on(VerifyCommand).rejects(genericError);

        await expect(handler(event)).rejects.toThrow('Unauthorized');
        expect(kmsMock.calls().length).toBe(1);
    });

    it('should throw UnauthorizedError if iss does not match TOKEN_ISSUER', async () => {
        process.env.TOKEN_ISSUER = 'https://expected-issuer.com';
        // Token has iss: 'https://example.com' which doesn't match
        await expect(handler(event)).rejects.toThrow(UnauthorizedError);
        delete process.env.TOKEN_ISSUER;
    });

    it('should throw UnauthorizedError if user_name is not a string', async () => {
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const header = Buffer.from(
            JSON.stringify({
                alg: 'RS256',
                typ: 'JWT',
                kid: 'alias/signing-key',
            }),
        ).toString('base64url');
        const payload = Buffer.from(
            JSON.stringify({
                user_name: 123,
                iss: 'https://example.com',
                iat: nowInSeconds,
                exp: nowInSeconds + 3600,
            }),
        ).toString('base64url');
        event.authorizationToken = `Bearer ${header}.${payload}.token`;

        await expect(handler(event)).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError if iss is not a string', async () => {
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const header = Buffer.from(
            JSON.stringify({
                alg: 'RS256',
                typ: 'JWT',
                kid: 'alias/signing-key',
            }),
        ).toString('base64url');
        const payload = Buffer.from(
            JSON.stringify({
                user_name: 'admin',
                iss: 123,
                iat: nowInSeconds,
                exp: nowInSeconds + 3600,
            }),
        ).toString('base64url');
        event.authorizationToken = `Bearer ${header}.${payload}.token`;

        await expect(handler(event)).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError if exp is not a number', async () => {
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const header = Buffer.from(
            JSON.stringify({
                alg: 'RS256',
                typ: 'JWT',
                kid: 'alias/signing-key',
            }),
        ).toString('base64url');
        const payload = Buffer.from(
            JSON.stringify({
                user_name: 'admin',
                iss: 'https://example.com',
                iat: nowInSeconds,
                exp: 'not-a-number',
            }),
        ).toString('base64url');
        event.authorizationToken = `Bearer ${header}.${payload}.token`;

        await expect(handler(event)).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError if iat is not a number', async () => {
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const header = Buffer.from(
            JSON.stringify({
                alg: 'RS256',
                typ: 'JWT',
                kid: 'alias/signing-key',
            }),
        ).toString('base64url');
        const payload = Buffer.from(
            JSON.stringify({
                user_name: 'admin',
                iss: 'https://example.com',
                iat: 'not-a-number',
                exp: nowInSeconds + 3600,
            }),
        ).toString('base64url');
        event.authorizationToken = `Bearer ${header}.${payload}.token`;

        await expect(handler(event)).rejects.toThrow(UnauthorizedError);
    });
});
