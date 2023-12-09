const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const dynamodb = DynamoDBDocument.from(new DynamoDB());
const projectId = process.env.GOOGLE_PROJECT_ID;
const keyContent = process.env.GOOGLE_KEY;
const sender = process.env.SENDER_EMAIL;
const region = process.env.REGION;

const sesClient = new SESClient({
  region: region, 
});

const storage = new Storage({
  projectId: projectId,
  credentials: JSON.parse(keyContent)
});

let email = "";
let isUploaded = false;
let isDownloaded = false;
let isSent = false;
const bucketName = process.env.BUCKET_NAME;
let publicUrl = "";
let uniqueFileName = "";
let errorMsg = "";


exports.handler = async (event) => {
  const message = JSON.parse(event.Records[0].Sns.Message);
  const submissionUrl = message.data.submission_url;
  email = message.data.submission_email;
  const fileName = path.basename(submissionUrl);

const localFilePath = path.join(os.tmpdir(), fileName); 
const writerStream = fs.createWriteStream(localFilePath);

try {
  const response = await axios({
    method: 'GET',
    url: submissionUrl,
    responseType: 'stream'
  });

  response.data.pipe(writerStream);

  await new Promise((resolve, reject) => {
    writerStream.on('finish', resolve);
    writerStream.on('error', reject);
  });

  console.log('File downloaded successfully to:', localFilePath);
  isDownloaded = true;
} catch (error) {
  console.error('Error downloading file:', error);
  isDownloaded = false;
  errorMsg += error;
}

try {
  if(isDownloaded) {
    const currentDate = new Date();
    const dateString = currentDate.toISOString().replace(/[\:\.\-T]/g, '');
    uniqueFileName = `${fileName}-${dateString}`;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(uniqueFileName);

    const readStream = fs.createReadStream(localFilePath);
    const writeStream = file.createWriteStream();

    readStream.pipe(writeStream);

    await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);

    console.log('File uploaded successfully to Google Cloud Storage:', uniqueFileName);
    isUploaded = true;
  });
  }else{
    console.error('Error donwloading file to local');
  }
} catch (error) {
  console.error('Error uploading file to Google Cloud Storage:', error);
  isUploaded = false;
  errorMsg += error;
} finally {
  publicUrl = `${bucketName}/${encodeURIComponent(uniqueFileName)}`;
  fs.unlinkSync(localFilePath);
}

  // Send the email
  try {
    await sendMail(email, isUploaded && isDownloaded ? "Assignment Upload Successful" : "Assignment Upload Failed", 
                   isUploaded && isDownloaded  ? `Your file ${fileName} has been uploaded to GCP successfully.
        
Copy and paste the following URL into your browser to access the file:
                         
                        ${publicUrl}
                   
Please use a browser that has already authenticated to your Google Cloud Platform.
                   
Connor
Director of Marketing
403 Aurora Ave S, 98106, Seattle, WA`
                           
: 

`There was an error uploading your file.
                   
The error message is:
                   
                  ${errorMsg}
                   
Connor
Director of Marketing
403 Aurora Ave S, 98106, Seattle, WA`);
  } catch (error) {
    console.error("Error sending email:", error);
  }

  return {
    statusCode: isUploaded ? 200 : 500,
    body: JSON.stringify(`${submissionUrl}  ${email}  File ${isUploaded ? 'successfully' : 'failed to'} uploaded to GCS bucket ${bucketName}`)
  };
}

async function sendMail(email, subject, content) {
  const params = {
    Source: sender, 
    Destination: {
      ToAddresses: [email], 
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Text: {
          Data: content,
        },
      },
    },
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    isSent = true;
    await addToDynamoDB(email);
  } catch (error) {
    console.error("Error sending email with SES:", error);
    isSent = false;
  }
}

async function addToDynamoDB(email) {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  const params = {
    TableName: tableName,  
    Item: {
      'id': uuidv4(),
      'email': email,
      'timestamp': new Date().toISOString(),  // ISO 格式的当前时间
      'status': isSent ? "OK" : "Failed"
    }
  };

  try {
    await dynamodb.put(params);
  } catch (error) {
    console.error('Error inserting data into DynamoDB', error);
  }
}

