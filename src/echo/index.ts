import { APIGatewayEvent } from 'aws-lambda';

export const handler = async (event: APIGatewayEvent) => {
    // Headers carry the caller's bearer token, so they are neither logged nor
    // echoed back. Everything else in the event is safe to reflect.
    const { headers, multiValueHeaders, ...safeEvent } = event;
    console.log(`Input event: ${JSON.stringify(safeEvent)}`);
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'success', event: safeEvent }),
    };
};
