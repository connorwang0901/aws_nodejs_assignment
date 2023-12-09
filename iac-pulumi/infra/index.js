const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const gcp = require("@pulumi/gcp");

const config = new pulumi.Config();
const vpcCidrBlock = config.require("vpcCidrBlock");
const awsRegion = config.require("awsRegion");
const publicSubnetCidrBase = config.require("publicSubnetCidrBase");
const privateSubnetCidrBase = config.require("privateSubnetCidrBase");

const amiId = config.require("myAmiId");
const zoneId = config.require("zoneId");
const domain = config.require("domain");
const gcpProjectId = config.require("gcpProjectId");
const senderEmail = config.require("senderEmail");
const bucketName = config.require("bucketName");


const provider = new aws.Provider("provider", {
    region: awsRegion
});


const cloudwatchAgentPolicy = new aws.iam.Policy("cloudwatchAgentPolicy", {
    description: "A policy for CloudWatch agent",
    policy: `{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "cloudwatch:PutMetricData",
                    "logs:PutLogEvents",
                    "logs:DescribeLogStreams",
                    "logs:CreateLogStream",
                    "logs:CreateLogGroup"
                ],
                "Resource": "*"
            }
        ]
    }`,
});

//create sns topic
const topic = new aws.sns.Topic("submissionTopic", {
    name: "submissionTopic", 
});


const snsPublishPolicy = new aws.iam.Policy("snsPublishPolicy", {
    description: "A policy that allows publishing to SNS topics",
    policy: topic.arn.apply(arn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: "sns:Publish",
                Resource: arn
            },
        ],
    })),
});

const cloudwatchAgentRole = new aws.iam.Role("cloudwatchAgentRole", {
    assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": "sts:AssumeRole",
                "Principal": {
                    "Service": "ec2.amazonaws.com"
                },
                "Effect": "Allow",
                "Sid": ""
            }
        ]
    }`
});

const snsPublishPolicyAttachment = new aws.iam.RolePolicyAttachment("snsPublishPolicyAttachment", {
    role: cloudwatchAgentRole,
    policyArn: snsPublishPolicy.arn,
});

const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("cloudwatchAgentRolePolicyAttachment", {
    role: cloudwatchAgentRole,
    policyArn: cloudwatchAgentPolicy.arn,
});

const ec2InstanceProfile = new aws.iam.InstanceProfile("ec2InstanceProfile", {
    role: cloudwatchAgentRole.name,
});

//create vpc
const vpc = new aws.ec2.Vpc("myVpc", {
    cidrBlock: vpcCidrBlock,
}, { provider: provider });

//create subnets
const publicSubnets = [];
const privateSubnets = [];



for (let i = 0; i < 3; i++) {
    publicSubnets.push(new aws.ec2.Subnet(`publicSubnet-${i}`, {
        vpcId: vpc.id,
        cidrBlock: `${publicSubnetCidrBase}.${i + 1}.0/24`,
        availabilityZone: `${awsRegion}${String.fromCharCode(97 + i)}`, 
        mapPublicIpOnLaunch: true,
    }, { provider: provider }));

    privateSubnets.push(new aws.ec2.Subnet(`privateSubnet-${i}`, {
        vpcId: vpc.id,
        cidrBlock: `${privateSubnetCidrBase}.${i + 4}.0/24`,
        availabilityZone: `${awsRegion}${String.fromCharCode(97 + i)}`, 
    }, { provider: provider }));
}
//create internet gateway
const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {
    vpcId: vpc.id,
});


//create route table, connect with routes
const publicRouteTable = new aws.ec2.RouteTable("publicRouteTable", {
    vpcId: vpc.id,
});


publicSubnets.forEach((subnet, index) => {
    new aws.ec2.RouteTableAssociation(`publicRta-${index}`, {
        subnetId: subnet.id,
        routeTableId: publicRouteTable.id,
    });
});

const privateRouteTable = new aws.ec2.RouteTable("privateRouteTable", {
    vpcId: vpc.id,
});

privateSubnets.forEach((subnet, index) => {
    new aws.ec2.RouteTableAssociation(`privateRta-${index}`, {
        subnetId: subnet.id,
        routeTableId: privateRouteTable.id,
    });
});

//create public route
const publicRoute = new aws.ec2.Route("publicRoute", {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: internetGateway.id,
});


const dbParameterGroupName = config.get("database.parameter_group_name") || "pg14";
//create parameter group
const postgresParameterGroup = new aws.rds.ParameterGroup("pg14", {
    family: "postgres14",
    description: "Custom parameter group for postgres14",
    tags: {
        "Name": dbParameterGroupName,
    },
});

//create db subnet
const dbSubnetGroup = new aws.rds.SubnetGroup("my-db-subnet-group", {
    subnetIds: privateSubnets.map(subnet => subnet.id),
    description: "My RDS DB Subnet Group",
    tags: {
        "Name": "postgres_group"
    }
});


const databaseUsername = config.require("databaseUsername");
const databasePassword = config.require("databasePassword");
const databasePort = config.require("databasePort");
const databaseInstanceName = config.require("databaseInstanceName");
const databaseDialect = config.require("databaseDialect");


// create load balancer security group
const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup("loadBalancerSecurityGroup", {
    vpcId: vpc.id,
    ingress: [
        { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] },
    ],
    egress: [
        { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
    ]
}, { provider: provider });


//create security group
const appSecurityGroup = new aws.ec2.SecurityGroup("appSecurityGroup", {
    description: "EC2 security group",
    vpcId: vpc.id,
    ingress: [
        { 
            protocol: "tcp", 
            fromPort: 8080, 
            toPort: 8080, 
            securityGroups: [loadBalancerSecurityGroup.id], 
        },
        { 
            protocol: "tcp", 
            fromPort: 22, 
            toPort: 22, 
            cidrBlocks: ["0.0.0.0/0"], 
        },
    ],
    egress: [
        {
            protocol: "-1", 
            fromPort: 0,     
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"], 
        },
    ],
}, { provider: provider });



// Build db secrutiy group
const dbSecurityGroup = new aws.ec2.SecurityGroup("dbSecurityGroup", {
    description: "EC2 security group for RDS instances",
    vpcId:vpc.id,
    ingress: [
        {
            protocol: "tcp",
            fromPort: 5432,
            toPort: 5432,
            securityGroups: [appSecurityGroup.id], 
        },
    ],
    egress: [
        {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
});

//create db instance
const dbInstance = new aws.rds.Instance("csye6225", {
    engine: "postgres",
    engineVersion: "14",
    instanceClass: "db.t3.micro",
    username: databaseUsername,
    password: databasePassword,
    allocatedStorage: 20,
    skipFinalSnapshot: true,
    dbSubnetGroupName: dbSubnetGroup.name,
    vpcSecurityGroupIds: [dbSecurityGroup.id],
    name: "csye6225",
    multiAz: false,
    publiclyAccessible: false,
    availabilityZone: privateSubnets[0].availabilityZone,
    dbParameterGroupName: postgresParameterGroup.name,
    
}, { dependsOn: [postgresParameterGroup] });

//ec2 rds connect
const ec2_rds_connect = new aws.ec2.SecurityGroupRule("ec2RdsConnectRule", {
    description: "EC2 to RDS connect rule",
    securityGroupId: appSecurityGroup.id,
    type: "egress",
    protocol: "tcp",
    fromPort: 5432,
    toPort: 5432,
    sourceSecurityGroupId: dbSecurityGroup.id
});


//define user data
const userData = pulumi.all([topic.arn, dbInstance.address, databaseUsername, databasePassword, databasePort, databaseInstanceName, databaseDialect]).apply(([snsTopicArn, dbEndpoint, databaseUsername, databasePassword, databasePort, databaseInstanceName, databaseDialect]) => {
    const script = `#!/bin/bash
    ENV_FILE="/opt/application.properties"
    sudo echo "DB_USERNAME=${databaseUsername}" > $ENV_FILE
    sudo echo "DB_PASSWORD=${databasePassword}" >> $ENV_FILE
    sudo echo "DB_HOSTNAME=${dbEndpoint.toString()}" >> $ENV_FILE
    sudo echo "DB_PORT=${databasePort}" >> $ENV_FILE
    sudo echo "DB_DATABASE=${databaseInstanceName}" >> $ENV_FILE
    sudo echo "DB_DIALECT=${databaseDialect}" >> $ENV_FILE
    sudo echo "SNS_ARN=${snsTopicArn}" >> $ENV_FILE

    source /opt/application.properties
    sudo systemctl daemon-reload
    sudo systemctl start csye6225
    sudo systemctl status csye6225
    sudo systemctl enable csye6225
    sudo systemctl start amazon-cloudwatch-agent
`;
    return Buffer.from(script).toString('base64');
});


// create load balancer
const appLoadBalancer = new aws.lb.LoadBalancer("appLoadBalancer", {
    subnets: publicSubnets.map(subnet => subnet.id),
    securityGroups: [loadBalancerSecurityGroup.id],
    internal: false,
}, { provider: provider });

// create target group
const appTargetGroup = new aws.lb.TargetGroup("appTargetGroup", {
    port: 8080,
    protocol: "HTTP",
    vpcId: vpc.id,
    healthCheck: {
        enabled: true,
        interval: 30,
        path: "/healthz",
        port: "8080",
        healthyThreshold: 2,
        unhealthyThreshold: 2,
        timeout: 3,
        protocol: "HTTP",
    },
}, { provider: provider });

// create launch template
const launchTemplate = new aws.ec2.LaunchTemplate("appLaunchTemplate", {
    imageId: amiId,
    instanceType: "t2.micro",
    keyName: "CSYE6225key",
    iamInstanceProfile: {
        name: ec2InstanceProfile.name, 
    },
    userData: userData, 
    networkInterfaces: [{
        associatePublicIpAddress: true, 
        securityGroups: [appSecurityGroup.id],
    }],
}, { provider: provider, dependsOn: [appSecurityGroup]});

// create auto scale group
const autoScalingGroup = new aws.autoscaling.Group("autoScalingGroup", {
    vpcZoneIdentifiers: publicSubnets.map(subnet => subnet.id),
    maxSize: 3,
    minSize: 1,
    desiredCapacity: 1,
    launchTemplate: {
        id: launchTemplate.id,
        version: `$Latest`,
    },
    name: "csye6225autoScalingGroup",
    targetGroupArns: [appTargetGroup.arn],
}, { provider: provider });

// create scale policy
const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
    scalingAdjustment: 1,
    adjustmentType: "ChangeInCapacity",
    cooldown: 60,
    autoscalingGroupName: autoScalingGroup.name,
}, { provider: provider });

const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
    scalingAdjustment: -1,
    adjustmentType: "ChangeInCapacity",
    cooldown: 60,
    autoscalingGroupName: autoScalingGroup.name,
}, { provider: provider });

// create alarm
const scaleUpAlarm = new aws.cloudwatch.MetricAlarm("scaleUpAlarm", {
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 2,
    metricName: "CPUUtilization",
    namespace: "AWS/EC2",
    period: 60,
    statistic: "Average",
    threshold: 5,
    alarmDescription: "Scale up if CPU util over 5%",
    alarmActions: [scaleUpPolicy.arn],
    dimensions: {
        AutoScalingGroupName: autoScalingGroup.name,
    },
}, { provider: provider });

const scaleDownAlarm = new aws.cloudwatch.MetricAlarm("scaleDownAlarm", {
    comparisonOperator: "LessThanThreshold",
    evaluationPeriods: 2,
    metricName: "CPUUtilization",
    namespace: "AWS/EC2",
    period: 60,
    statistic: "Average",
    threshold: 3,
    alarmDescription: "Scale down if CPU util below 3%",
    alarmActions: [scaleDownPolicy.arn],
    dimensions: {
        AutoScalingGroupName: autoScalingGroup.name,
    },
}, { provider: provider });

//create A record
const dnsRecord = new aws.route53.Record("dnsRecord", {
    zoneId: zoneId,
    name: domain,
    type: "A",
    aliases: [
        {
            name: appLoadBalancer.dnsName,
            zoneId: appLoadBalancer.zoneId,
            evaluateTargetHealth: true,
        },
    ],
}, { provider: provider });

// create google service account
const serviceAccount = new gcp.serviceaccount.Account("iac-account", {
    accountId: "iac-account",
    displayName: "iac-account",
});

// create service key
const serviceAccountKey = new gcp.serviceaccount.Key("iac-account-key", {
    serviceAccountId: serviceAccount.name,
});

const storageObjectCreatorBinding = new gcp.projects.IAMMember("storageObjectCreatorBinding", {
    member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
    role: "roles/storage.objectCreator",
    project: gcpProjectId,
});

const bucketIAMBinding = new gcp.storage.BucketIAMBinding("bucketIAMBinding", {
    bucket: bucketName,
    role: "roles/storage.objectCreator",
    members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
});

// create lamada role
const lambdaRole = new aws.iam.Role("my-lambda-role", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "lambda.amazonaws.com",
            },
        }],
    }),
});

// create lamada policy
const lambdaPolicy = new aws.iam.Policy("my-lambda-policy", {
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Action: [
                    "dynamodb:*",
                    "sns:*",
                    "ses:SendEmail",
                    "ses:SendRawEmail",
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                Resource: "*",
                Effect: "Allow",
            },
        ],
    }),
});

// attach lamada policy to lamada role
const lamadaRolePolicyAttachment = new aws.iam.RolePolicyAttachment("my-lambda-role-policy-attachment", {
    role: lambdaRole,
    policyArn: lambdaPolicy.arn,
});

const lambdaBasicExecutionRoleAttachment = new aws.iam.RolePolicyAttachment("lambdaBasicExecutionRoleAttachment", {
    role: lambdaRole,
    policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
});


const table = new aws.dynamodb.Table("email_sending", {
    attributes: [
        {
            name: "id",
            type: "S",
        },
    ],
    hashKey: "id",
    readCapacity: 1,
    writeCapacity: 1,
});

// create lamada function, and attach lamada role
const lambda = new aws.lambda.Function("csye6225", {
    code: new pulumi.asset.FileArchive("/Users/Connor/Desktop/serverless"),
    role: lambdaRole.arn,
    handler: "index.handler",
    runtime: "nodejs16.x",
    timeout: 60,
    environment: {
        variables: {
            GOOGLE_PROJECT_ID: gcpProjectId,
            GOOGLE_KEY: serviceAccountKey.privateKey.apply(key => Buffer.from(key, 'base64').toString('utf-8')),
            BUCKET_NAME: bucketName,
            SENDER_EMAIL: senderEmail,
            REGION: awsRegion,
            DYNAMODB_TABLE_NAME: table.name.apply(name => name),
        },
    },
});


lambda.environment = {
    variables: {
        ...lambda.environment.variables,
    },
};

const lambdaSubscription = new aws.sns.TopicSubscription("lambdaSubscription", {
    topic: topic.arn,
    protocol: "lambda",
    endpoint: lambda.arn,
});

const lambdaPermission = new aws.lambda.Permission("lambdaPermission", {
    action: "lambda:InvokeFunction",
    function: lambda.name,
    principal: "sns.amazonaws.com",
    sourceArn: topic.arn,
});

// get acm certificate
const certificate = aws.acm.getCertificate({
    domain: "demo.xxxxx.online", 
    mostRecent: true
});

const certificateArn = pulumi.output(certificate.then(cert => cert.arn));

// update listener
const appListener = new aws.lb.Listener("appListener", {
    loadBalancerArn: appLoadBalancer.arn,
    port: 443,
    protocol: "HTTPS",
    sslPolicy: "ELBSecurityPolicy-2016-08", 
    certificateArn: certificateArn,
    defaultActions: [{
        type: "forward",
        targetGroupArn: appTargetGroup.arn 
    }]
}, { provider: provider });
