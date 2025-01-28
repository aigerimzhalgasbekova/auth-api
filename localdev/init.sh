#!/bin/sh

runtime=nodejs20.x
kmsKeyAlias=alias/signing-key
Version=0.0.1

# Create KMS signing keys
keyId=$(aws --endpoint-url=http://localhost:4566 kms create-key --key-usage SIGN_VERIFY --customer-master-key-spec RSA_2048 --output text --query 'KeyMetadata.KeyId')
# Set key alias
aws --endpoint-url=http://localhost:4566 kms create-alias --alias-name $kmsKeyAlias --target-key-id $keyId

# Output public key
aws --endpoint-url=http://localhost:4566 kms get-public-key --key-id $keyId --output text --query PublicKey | base64 -d > pubkey.der
openssl rsa -pubin -inform DER -outform PEM -in pubkey.der -pubout -out pubkey.pem
cat pubkey.pem

# Create user data in DynamoDB
aws --endpoint-url=http://localhost:4566 dynamodb create-table \
    --table-name Users \
    --attribute-definitions AttributeName=Username,AttributeType=S AttributeName=Password,AttributeType=S \
    --key-schema AttributeName=Username,KeyType=HASH AttributeName=Password,KeyType=RANGE \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5

# # Add user to DynamoDB table
aws --endpoint-url=http://localhost:4566 dynamodb put-item \
    --table-name Users \
    --item '{
        "Username": {"S": "admin"},
        "Password": {"S": "admin"}
    }'

# List records in DynamoDB table
aws --endpoint-url=http://localhost:4566 dynamodb scan --table-name Users

# Create token issuer lambda
aws --endpoint-url=http://localhost:4566 lambda create-function \
    --function-name token \
    --runtime $runtime \
    --role arn:aws:iam::123456789012:role/unsafe \
    --handler index.handler \
    --zip-file fileb://dist/auth-token-issuer-$Version.zip \
    --environment "Variables={KMS_KEY_ALIAS_NAME=$kmsKeyAlias}"

# Wait for token issuer function to be provisioned
aws --endpoint-url=http://localhost:4566 lambda wait function-active --function-name token

# Execute Lambda function
aws --endpoint-url=http://localhost:4566 lambda invoke \
    --function-name arn:aws:lambda:eu-west-1:000000000000:function:token \
    --payload '{ }' \
    output.txt

# Create API Gateway endpoint
apiId=$(aws --endpoint-url=http://localhost:4566 apigateway create-rest-api --name 'TokenAPI' --output text --query 'id')
rootResourceId=$(aws --endpoint-url=http://localhost:4566 apigateway get-resources --rest-api-id $apiId --output text --query 'items[0].id')
resourceId=$(aws --endpoint-url=http://localhost:4566 apigateway create-resource \
    --rest-api-id $apiId \
    --parent-id $rootResourceId \
    --path-part token \
    --output text --query 'id')

# Create POST method for /token
aws --endpoint-url=http://localhost:4566 apigateway put-method \
    --rest-api-id $apiId \
    --resource-id $resourceId \
    --http-method POST \
    --authorization-type NONE

# Get Lambda ARN
lambdaArn=$(aws --endpoint-url=http://localhost:4566 lambda get-function --function-name token --output text --query 'Configuration.FunctionArn')
# Set integration for /token POST method
aws --endpoint-url=http://localhost:4566 apigateway put-integration \
    --rest-api-id $apiId \
    --resource-id $resourceId \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/$lambdaArn/invocations" \
    --passthrough-behavior WHEN_NO_MATCH

# Create API Gateway using Lambda authorizer
echoApiId=$(aws --endpoint-url=http://localhost:4566 apigateway create-rest-api --name 'EchoAPI' --output text --query 'id')
echoRootResourceId=$(aws --endpoint-url=http://localhost:4566 apigateway get-resources --rest-api-id $echoApiId --output text --query 'items[0].id')
# Create authorizer lambda
authorizerLambdaArn=$(aws --endpoint-url=http://localhost:4566 lambda create-function \
    --function-name authorizer \
    --runtime $runtime \
    --role arn:aws:iam::123456789012:role/unsafe \
    --handler index.handler \
    --zip-file fileb://dist/authorizer-$Version.zip \
    --environment "Variables={KMS_KEY_ALIAS_NAME=$kmsKeyAlias}" \
    --output text --query 'FunctionArn')
# Wait for authorizer function to be provisioned
aws --endpoint-url=http://localhost:4566 lambda wait function-active --function-name authorizer

# Create api authorizer
authorizerId=$(aws --endpoint-url=http://localhost:4566 apigateway create-authorizer \
    --rest-api-id $echoApiId \
    --name authorizer \
    --type TOKEN \
    --authorizer-uri "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/$authorizerLambdaArn/invocations" \
    --identity-source 'method.request.header.Authorization' \
    --authorizer-result-ttl-in-seconds 300 \
    --output text --query 'id')

# Create ANY method for root resource
aws --endpoint-url=http://localhost:4566 apigateway put-method \
    --rest-api-id $echoApiId \
    --resource-id $echoRootResourceId \
    --http-method ANY \
    --authorization-type CUSTOM \
    --authorizer-id $authorizerId \
    --request-parameters "method.request.header.Authorization=true"

# Create /echo endpoint
echoResourceId=$(aws --endpoint-url=http://localhost:4566 apigateway create-resource \
    --rest-api-id $echoApiId \
    --parent-id $echoRootResourceId \
    --path-part echo \
    --output text --query 'id')
# Create GET method for /echo
aws --endpoint-url=http://localhost:4566 apigateway put-method \
    --rest-api-id $echoApiId \
    --resource-id $echoResourceId \
    --http-method GET \
    --authorization-type CUSTOM \
    --authorizer-id $authorizerId \
    --request-parameters "method.request.header.Authorization=true"
# Create echo lambda
echoLambdaArn=$(aws --endpoint-url=http://localhost:4566 lambda create-function \
    --function-name echo \
    --runtime $runtime \
    --role arn:aws:iam::123456789012:role/unsafe \
    --handler index.handler \
    --zip-file fileb://dist/echo-$Version.zip \
    --output text --query 'FunctionArn')
# Wait for echo function to be provisioned
aws --endpoint-url=http://localhost:4566 lambda wait function-active --function-name echo
# Set integration for /echo GET method
aws --endpoint-url=http://localhost:4566 apigateway put-integration \
    --rest-api-id $echoApiId \
    --resource-id $echoResourceId \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/$echoLambdaArn/invocations" \
    --passthrough-behavior WHEN_NO_MATCH

# Deploy APIs
aws --endpoint-url=http://localhost:4566 apigateway create-deployment \
    --rest-api-id $apiId \
    --stage-name dev

aws --endpoint-url=http://localhost:4566 apigateway create-deployment \
    --rest-api-id $echoApiId \
    --stage-name dev
