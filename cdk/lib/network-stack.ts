import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkStackProps extends cdk.StackProps {
    vpcCidr?: string;
}

export class NetworkStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;
    public readonly lambdaSecurityGroup: ec2.SecurityGroup;

    constructor(scope: Construct, id: string, props: NetworkStackProps = {}) {
        super(scope, id, props);

        // Create VPC
        this.vpc = new ec2.Vpc(this, 'ApiVpc', {
            ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr || '10.0.0.0/16'),
            maxAzs: 2,
            natGateways: 1,
            subnetConfiguration: [
                {
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24,
                },
                {
                    name: 'Private',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24,
                },
            ],
        });

        // Create security group for Lambda functions
        this.lambdaSecurityGroup = new ec2.SecurityGroup(
            this,
            'LambdaSecurityGroup',
            {
                vpc: this.vpc,
                description: 'Security group for Lambda functions',
                allowAllOutbound: true,
            },
        );

        // Add outputs
        new cdk.CfnOutput(this, 'VpcId', {
            value: this.vpc.vpcId,
            description: 'VPC ID',
        });
    }
}
