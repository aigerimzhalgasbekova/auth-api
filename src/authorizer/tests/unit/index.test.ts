import {
    KMSClient,
    KMSInvalidSignatureException,
    VerifyCommand,
} from '@aws-sdk/client-kms';
import {
    APIGatewayTokenAuthorizerEvent,
    APIGatewayAuthorizerResult,
} from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler, UnauthorizedError } from '../../index';

process.env.KMS_KEY_ALIAS_NAME = 'alias/signing-key';

const kmsMock = mockClient(KMSClient);

describe('handler', () => {
    const event: APIGatewayTokenAuthorizerEvent = {
        type: 'TOKEN',
        authorizationToken:
            'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImFsaWFzL3NpZ25pbmcta2V5In0.eyJ1c2VyX25hbWUiOiJhZG1pbiIsImlzcyI6Imh0dHBzOi8vZXhhbXBsZS5jb20iLCJpYXQiOjE3MzYwMTQzNzYsImV4cCI6MTczNjAxNzk3Nn0.token',
        methodArn:
            'arn:aws:execute-api:region:account-id:api-id/stage/verb/resource',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        kmsMock.reset();
    });

    it('should return the result of authorize function', async () => {
        const expectedResult: APIGatewayAuthorizerResult = {
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
            context: {
                user_name: 'admin',
                iss: 'https://example.com',
                iat: 1736014376,
                exp: 1736017976,
            },
        };
        kmsMock.on(VerifyCommand).resolves({
            SignatureValid: true,
        });

        const result = await handler(event);

        expect(result).toEqual(expectedResult);
        expect(kmsMock.calls().length).toBe(1);
        console.log(JSON.stringify(kmsMock.call(0).args[0].input));
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
});
