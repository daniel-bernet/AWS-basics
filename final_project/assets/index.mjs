// Import required modules and clients for AWS services and HTTP requests
import axios from 'axios';
import { S3Client, PutObjectCommand, PutObjectAclCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';
import { MongoClient } from 'mongodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Initialize clients for AWS services
const s3 = new S3Client();
const rekognition = new RekognitionClient();
const secretsManager = new SecretsManagerClient();

// Function to retrieve and parse all secrets stored under a single Secrets Manager secret
const fetchAllSecrets = async () => {
    const secretId = 'myFinalProjectSecrets';  // The ARN or name of the secret where all keys are stored
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const data = await secretsManager.send(command);
    return JSON.parse(data.SecretString);  // Return the parsed secrets directly
};

// Main handler function for AWS Lambda
export const handler = async (event) => {
    try {
        // Fetch all secrets once
        const secrets = await fetchAllSecrets();

        // Access secrets directly from the fetched JSON object
        const {
            MONGODB_CLUSTER: mongoCluster,
            MONGODB_PASSWORD: mongoPassword,
            MONGODB_USERNAME: mongoUser,
            MONGODB_COLLECTION_NAME: mongoCollection,
            MONGODB_DATABASE_NAME: mongoDBName,
            S3_BUCKET_NAME: bucketName,
            UNSPLASH_ACCESS_KEY: unsplashKey
        } = secrets;

        // Construct MongoDB connection URI
        const mongoURI = `mongodb+srv://${mongoUser}:${mongoPassword}@${mongoCluster}.mongodb.net/${mongoDBName}?retryWrites=true&w=1`;

        // Fetch a random photo from Unsplash using the stored API key
        const unsplashResponse = await axios.get('https://api.unsplash.com/photos/random', {
            headers: { Authorization: `Client-ID ${unsplashKey}` },
        });

        // Extract important details from the fetched photo
        const { data: photo } = unsplashResponse;
        const imageUrl = photo.urls.regular;
        const imageId = photo.id;

        // Download the image using Axios
        const imageResp = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageData = Buffer.from(imageResp.data, 'binary');

        // Upload the image to AWS S3 and make it publicly accessible
        const uploadParams = {
            Bucket: bucketName,
            Key: `${imageId}.jpg`,
            Body: imageData,
            ContentType: 'image/jpeg',
        };
        await s3.send(new PutObjectCommand(uploadParams));

        // Analyze image using AWS Rekognition to detect labels
        const labelParams = {
            Image: { S3Object: { Bucket: bucketName, Name: `${imageId}.jpg` } },
            MaxLabels: 5
        };
        const labelData = await rekognition.send(new DetectLabelsCommand(labelParams));
        const labelResults = labelData.Labels.map(label => ({
            Name: label.Name,
            Confidence: label.Confidence
        }));

        // Connect to MongoDB to store image metadata
        const mongoClient = new MongoClient(mongoURI);
        await mongoClient.connect();
        const db = mongoClient.db(mongoDBName);
        const coll = db.collection(mongoCollection);

        // Define and insert document for the downloaded image
        const metadata = {
            id: imageId,
            description: photo.alt_description,
            author: photo.user.username,
            labels: labelResults
        };
        await coll.insertOne(metadata);

        // Disconnect from MongoDB
        await mongoClient.close();

        // Adjust S3 object's permissions to allow public access
        const aclParams = {
            Bucket: bucketName,
            Key: `${imageId}.jpg`,
            ACL: 'public-read',
        };
        await s3.send(new PutObjectAclCommand(aclParams));

        // Return a successful response
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Operation Successful', metadata }),
        };
    } catch (error) {
        // Handle and log errors
        console.error('Processing failed', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Processing Error', error: error.message }),
        };
    }
};
