# Secure Authentication API with JWT Token Issuer and Authorizer

This project implements a secure authentication API using AWS services, featuring a JWT token issuer and an authorizer for protected endpoints. The system is designed to provide robust authentication and authorization mechanisms for serverless applications.

The authentication API consists of two main components: a token issuer that generates JWT tokens for authenticated users, and an authorizer that validates these tokens for protected API endpoints. The project utilizes AWS Lambda functions, API Gateway, DynamoDB, and KMS for secure key management.

**NOTE:** this is not a production ready implementation. See the improvements suggestions below.

## Repository Structure

```
.
├── cdk/                   # AWS CDK infrastructure code
│   ├── bin/               # CDK app entry point
│   └── lib/               # CDK stack definitions
├── localdev/              # Local development scripts
├── src/                   # Lambda function source code
│   ├── auth-token-issuer/ # Token issuer function
│   ├── authorizer/        # Token authorizer function
│   └── echo/              # Example protected function
├── docker-compose.yaml    # LocalStack configuration for local development
└── README.md              # This file
```

Key Files:
- `cdk/bin/auth-api-infrastructure.ts`: Main CDK app entry point
- `cdk/lib/network-stack.ts`: VPC and network infrastructure
- `cdk/lib/token-issuer-stack.ts`: Token issuer API and resources
- `cdk/lib/echo-api-stack.ts`: Echo API with protected endpoint
- `localdev/init.sh`: Script to initialize local development environment
- `src/auth-token-issuer/index.ts`: Token issuer Lambda function
- `src/authorizer/index.ts`: Token authorizer Lambda function
- `src/echo/index.ts`: Example protected Lambda function

## Usage Instructions

### Prerequisites

- Node.js v20 or later
- AWS CLI v2
- AWS CDK v2
- Docker and Docker Compose (for local development)

### Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd <repository-name>
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Bootstrap the CDK (if not already done):
   ```
   cdk bootstrap
   ```

### Local Development

1. Build and deploy the Lambda functions:
   ```
   ./localdev/build-functions.sh
   ```

2. Start LocalStack:
   ```
   docker-compose up -d
   ```

3. Initialize the local environment:
   ```
   ./localdev/init.sh
   ```

### Deployment

To deploy the infrastructure to AWS:

```
cdk deploy --all
```

### Testing

To test the local API:

1. Obtain a token:
   ```
   curl -X POST http://localhost:4566/restapis/<api-id>/dev/_user_request_/token \
   -u admin:admin \
   -H 'Content-Type: application/x-www-form-urlencoded' \
   -d 'grant_type=client_credentials&scope=public'
   ```

2. Use the token to access the protected endpoint:
   ```
   curl -X GET http://localhost:4566/restapis/<api-id>/dev/_user_request_/echo \
   -H 'Authorization: Bearer <token>'
   ```

Replace `<api-id>` with the actual API ID obtained from the LocalStack output.

### Troubleshooting

Common issues:

1. LocalStack services not starting:
   - Ensure Docker is running and has sufficient resources allocated.
   - Check Docker logs: `docker-compose logs localstack`

2. Lambda function errors:
   - Review CloudWatch logs in the AWS Console or use:
     ```
     aws logs get-log-events --log-group-name /aws/lambda/<function-name>
     ```

3. API Gateway issues:
   - Verify API Gateway configuration:
     ```
     aws apigateway get-rest-apis
     ```

For detailed debugging:

1. Enable verbose logging in LocalStack:
   - Set `DEBUG=1` in the `docker-compose.yaml` file.

2. Use AWS CLI with `--debug` flag for more information:
   ```
   aws --debug --endpoint-url=http://localhost:4566 <command>
   ```

## Data Flow

The authentication process follows these steps:

1. Client sends credentials to the token issuer endpoint.
2. Token issuer validates credentials against DynamoDB.
3. If valid, token issuer generates a JWT using KMS for signing.
4. Client receives the JWT and uses it for subsequent requests.
5. Protected API endpoints use the authorizer to validate the JWT.
6. Authorizer verifies the JWT signature using KMS.
7. If valid, the request is allowed to proceed to the protected endpoint.

```
[Client] -> [Token Issuer API] -> [Token Issuer Lambda]
                                         |
                                         v
                                  [DynamoDB (Users)]
                                         |
                                         v
                                    [KMS (Signing)]
                                         |
                                         v
[Client] <- [JWT Token] <----------------+

[Client] -> [Protected API] -> [Authorizer Lambda] -> [KMS (Verification)]
                                         |
                                         v
                               [Protected Lambda Function]
```

## Infrastructure

The project uses AWS CDK to define and deploy the following resources:

- VPC:
  - `ApiVpc`: Custom VPC for isolating the API resources
  - `LambdaSecurityGroup`: Security group for Lambda functions

- KMS:
  - `JwtSigningKey`: Asymmetric KMS key for signing and verifying JWTs

- DynamoDB:
  - `TokenTable`: Table for storing token information

- Lambda:
  - `AuthTokenIssuerFunction`: Issues JWT tokens
  - `AuthorizerFunction`: Validates JWT tokens
  - `EchoFunction`: Example protected function

- API Gateway:
  - `TokenIssuerApi`: API for issuing tokens
  - `EchoApi`: API with protected endpoints

- IAM:
  - `AuthTokenIssuerRole`: IAM role for the token issuer Lambda
  - `AuthorizerRole`: IAM role for the authorizer Lambda
  - `EchoFunctionRole`: IAM role for the echo Lambda

These resources are organized into three main stacks: `NetworkStack`, `TokenIssuerStack`, and `EchoApiStack`, providing a modular and scalable infrastructure setup.


## Improvements Suggestions

- use AWS Cognito pool or RDS to store user's credentials instead of DynamoDB table;
- add domain support;
- add additional protection, like AWS WAF, CloudFront, etc;
- require api keys depending on your use case;
- add token refresh;
- add token revocation;
- add signing asymetric key management, like rotation.
