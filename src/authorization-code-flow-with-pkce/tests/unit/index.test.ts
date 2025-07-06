import { handler } from '../../index';
import { APIGatewayEvent } from 'aws-lambda';
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';
import { mockClient } from 'aws-sdk-client-mock';

const kmsMock = mockClient(KMSClient);

describe('Authorization Code Flow with PKCE', () => {
    beforeEach(() => {
        kmsMock.reset();
        process.env.KMS_KEY_ALIAS_NAME = 'alias/signing-key';
    });

    afterEach(() => {
        delete process.env.KMS_KEY_ALIAS_NAME;
    });

    describe('handler', () => {
        const createEvent = (
            queryParams: Record<string, string> = {},
        ): APIGatewayEvent => ({
            httpMethod: 'GET',
            path: '/authorize',
            queryStringParameters: queryParams,
            headers: {},
            multiValueHeaders: {},
            pathParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
            requestContext: {} as any,
            resource: '',
            isBase64Encoded: false,
            body: null,
        });

        it('should return 400 for missing response_type', async () => {
            const event = createEvent({
                client_id: 'test-client',
                redirect_uri: 'https://example.com/callback',
                code_challenge: 'test-challenge',
                code_challenge_method: 'S256',
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body)).toEqual({
                error: 'invalid_request',
                error_description: 'Missing required parameter: response_type',
            });
        });

        it('should return 400 for invalid response_type', async () => {
            const event = createEvent({
                response_type: 'token',
                client_id: 'test-client',
                redirect_uri: 'https://example.com/callback',
                code_challenge: 'test-challenge',
                code_challenge_method: 'S256',
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body)).toEqual({
                error: 'invalid_request',
                error_description: 'response_type must be "code"',
            });
        });

        it('should return 400 for invalid code_challenge_method', async () => {
            const event = createEvent({
                response_type: 'code',
                client_id: 'test-client',
                redirect_uri: 'https://example.com/callback',
                code_challenge: 'test-challenge',
                code_challenge_method: 'invalid',
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body)).toEqual({
                error: 'invalid_request',
                error_description:
                    'code_challenge_method must be "S256" or "plain"',
            });
        });

        it('should return 400 for invalid redirect_uri', async () => {
            const event = createEvent({
                response_type: 'code',
                client_id: 'test-client',
                redirect_uri: 'invalid-url',
                code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                code_challenge_method: 'S256',
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body)).toEqual({
                error: 'invalid_request',
                error_description: 'Invalid redirect_uri format',
            });
        });

        it('should generate authorization code for valid request', async () => {
            const event = createEvent({
                response_type: 'code',
                client_id: 'test-client',
                redirect_uri: 'https://example.com/callback',
                code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                code_challenge_method: 'S256',
                state: 'test-state',
            });

            // Mock KMS signing
            kmsMock.on(SignCommand).resolves({
                Signature: Buffer.from('test-signature'),
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(302);
            expect(result.headers?.Location).toContain('https://example.com/callback');
            expect(result.headers?.Location).toContain('code=');
            expect(result.headers?.Location).toContain('state=test-state');

            const responseBody = JSON.parse(result.body);
            expect(responseBody).toHaveProperty('code');
            expect(responseBody.state).toBe('test-state');
        });

        it('should handle KMS signing failure', async () => {
            const event = createEvent({
                response_type: 'code',
                client_id: 'test-client',
                redirect_uri: 'https://example.com/callback',
                code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                code_challenge_method: 'S256',
            });

            // Mock KMS signing failure
            kmsMock.on(SignCommand).resolves({
                Signature: undefined,
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(JSON.parse(result.body)).toEqual({
                error: 'server_error',
                error_description: 'Internal server error',
            });
        });
    });
});
