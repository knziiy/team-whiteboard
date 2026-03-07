import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import type { NetworkStack } from './network-stack';
import type { AuthStack } from './auth-stack';

interface ComputeStackProps extends cdk.StackProps {
  network: NetworkStack;
  auth: AuthStack;
}

export class ComputeStack extends cdk.Stack {
  public readonly elasticIp: ec2.CfnEIP;
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { network, auth } = props;

    // SSM parameters for secrets
    const dbPasswordParam = new ssm.StringParameter(this, 'DbPassword', {
      parameterName: '/whiteboard/db-password',
      stringValue: 'ChangeMe123!',  // Override post-deploy via SSM console or CLI
      description: 'PostgreSQL password',
    });

    const cfSecretParam = new ssm.StringParameter(this, 'CfSecret', {
      parameterName: '/whiteboard/cloudfront-secret',
      stringValue: 'ChangeMe-CF-Secret-' + Math.random().toString(36).slice(2),
      description: 'CloudFront custom header secret',
    });

    // IAM role for EC2
    const role = new iam.Role(this, 'Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Allow reading SSM parameters
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          dbPasswordParam.parameterArn,
          cfSecretParam.parameterArn,
        ],
      }),
    );

    // User data script
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      'exec > >(tee /var/log/user-data.log) 2>&1',

      // Update system
      'dnf update -y',

      // Install Docker
      'dnf install -y docker',
      'systemctl enable docker',
      'systemctl start docker',

      // Install Docker Compose plugin
      'mkdir -p /usr/lib/docker/cli-plugins',
      'curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/lib/docker/cli-plugins/docker-compose',
      'chmod +x /usr/lib/docker/cli-plugins/docker-compose',

      // Install git
      'dnf install -y git',

      // Setup application directory
      'mkdir -p /opt/whiteboard',

      // Get secrets from SSM
      `DB_PASSWORD=$(aws ssm get-parameter --name /whiteboard/db-password --query Parameter.Value --output text --region ${this.region})`,
      `CF_SECRET=$(aws ssm get-parameter --name /whiteboard/cloudfront-secret --query Parameter.Value --output text --region ${this.region})`,

      // Write .env file
      'cat > /opt/whiteboard/.env << EOF',
      'DB_PASSWORD=$DB_PASSWORD',
      `COGNITO_USER_POOL_ID=${auth.userPool.userPoolId}`,
      `COGNITO_CLIENT_ID=${auth.userPoolClient.userPoolClientId}`,
      'CLOUDFRONT_SECRET=$CF_SECRET',
      'EOF',

      // NOTE: docker-compose.yml and Dockerfile must be deployed separately
      // via CodeDeploy, S3 sync, or git clone. This UserData sets up the host.
      'echo "EC2 setup complete. Deploy application via docker compose."',
    );

    // EC2 instance
    this.instance = new ec2.Instance(this, 'Ec2Instance', {
      vpc: network.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: network.backendSg,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      role,
      userData,
      userDataCausesReplacement: false,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(20, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
        },
      ],
    });

    // Elastic IP
    this.elasticIp = new ec2.CfnEIP(this, 'ElasticIp', {
      instanceId: this.instance.instanceId,
      tags: [{ key: 'Name', value: 'whiteboard-backend' }],
    });

    new cdk.CfnOutput(this, 'InstanceId', { value: this.instance.instanceId });
    new cdk.CfnOutput(this, 'PublicIp', { value: this.elasticIp.ref });
    new cdk.CfnOutput(this, 'BackendUrl', { value: `http://${this.elasticIp.ref}:8080` });
  }
}
