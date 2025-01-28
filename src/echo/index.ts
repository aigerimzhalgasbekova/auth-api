import { APIGatewayEvent, Context } from 'aws-lambda';

export const handler = async (event: APIGatewayEvent, context: Context) => {
    console.log(`Input event: ${JSON.stringify(event)}`);
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'success', event, context }),
    };
};
