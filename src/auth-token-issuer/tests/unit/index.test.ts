import { KMSClient, SignCommand } from '@aws-sdk/client-kms';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../index';
import { APIGatewayEvent } from 'aws-lambda';

describe('Test issueing JWT token', () => {
    const ddbDocMock = mockClient(DynamoDBDocumentClient);
    const kmsMock = mockClient(KMSClient);

    beforeEach(() => {
        jest.setTimeout(1000 * 60 * 10);
        jest.clearAllMocks();
        ddbDocMock.reset();
        kmsMock.reset();
    });

    test('should return 401 when user does not exist', async () => {
        const event = {
            headers: {
                Authorization: 'Basic dGVzdDp0ZXN0',
            },
        };
        ddbDocMock.on(QueryCommand).resolves({
            Items: [],
        });
        const response = await handler(event as unknown as APIGatewayEvent);
        expect(response.statusCode).toBe(401);
        expect(ddbDocMock.calls().length).toBe(1);
        expect(kmsMock.calls().length).toBe(0);
    });

    test('should return 400 when credentials token is not valid', async () => {
        const event = {
            headers: {
                Authorization: 'Basic dXN',
            },
        };
        const response = await handler(event as unknown as APIGatewayEvent);
        expect(response.statusCode).toBe(400);
        expect(ddbDocMock.calls().length).toBe(0);
        expect(kmsMock.calls().length).toBe(0);
    });

    test('should successfully issue a JWT token', async () => {
        const event = {
            headers: {
                Authorization: 'Basic dGVzdDp0ZXN0', // test:test base64 encoded
            },
        };
        ddbDocMock.on(QueryCommand).resolves({
            Items: [
                {
                    Username: 'test',
                    Password: 'test',
                },
            ],
        });
        kmsMock.on(SignCommand).resolves({
            Signature: 'signature' as unknown as Uint8Array,
        });
        const response = await handler(event as unknown as APIGatewayEvent);
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).access_token).toBeDefined();
        expect(ddbDocMock.calls().length).toBe(1);
        expect(kmsMock.calls().length).toBe(1);
    });
    test('should use base64url encoding for JWT token parts', async () => {
        const event = {
            headers: {
                Authorization: 'Basic dGVzdDp0ZXN0', // test:test base64 encoded
            },
        };
        ddbDocMock.on(QueryCommand).resolves({
            Items: [
                {
                    Username: 'test',
                    Password: 'test',
                },
            ],
        });
        kmsMock.on(SignCommand).resolves({
            Signature: Buffer.from([0xff, 0xfe, 0xfd]),
        });
        const response = await handler(event as unknown as APIGatewayEvent);
        expect(response.statusCode).toBe(200);
        const token = JSON.parse(response.body).access_token;
        const [header, payload, signature] = token.split('.');
        // base64url must not contain +, /, or = characters
        const base64urlRegex = /^[A-Za-z0-9_-]+$/;
        expect(header).toMatch(base64urlRegex);
        expect(payload).toMatch(base64urlRegex);
        expect(signature).toMatch(base64urlRegex);
    });
    test('should return 500 when KMS signature is missing', async () => {
        const event = {
            headers: {
                Authorization: 'Basic dGVzdDp0ZXN0', // test:test base64 encoded
            },
        };
        ddbDocMock.on(QueryCommand).resolves({
            Items: [
                {
                    Username: 'test',
                    Password: 'test',
                },
            ],
        });
        kmsMock.on(SignCommand).resolves({});
        const response = await handler(event as unknown as APIGatewayEvent);
        expect(response.statusCode).toBe(500);
    });
    test('should return 500 when KMS throws an error', async () => {
        const event = {
            headers: {
                Authorization: 'Basic dGVzdDp0ZXN0', // test:test base64 encoded
            },
        };
        ddbDocMock.on(QueryCommand).resolves({
            Items: [
                {
                    Username: 'test',
                    Password: 'test',
                },
            ],
        });
        kmsMock
            .on(SignCommand)
            .rejects(new Error('Reffered KMS key does not exist'));
        const response = await handler(event as unknown as APIGatewayEvent);
        expect(response.statusCode).toBe(500);
    });
    test('should return 500 when DynamoDB throws an error', async () => {
        const event = {
            headers: {
                Authorization: 'Basic dGVzdDp0ZXN0', // test:test base64 encoded
            },
        };
        ddbDocMock.on(QueryCommand).rejects(new Error('Internal server error'));
        const response = await handler(event as unknown as APIGatewayEvent);
        expect(response.statusCode).toBe(500);
    });
});
