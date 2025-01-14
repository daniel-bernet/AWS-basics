// Importieren der notwendigen AWS Module.
// S3 ermöglicht den Zugriff auf S3-Buckets, Rekognition ermöglicht den Zugriff auf die Rekognition-API
// PutObjectAclCommand erlaubt das Ändern der Zugriffsrechte eines Objekts in einem Bucket
import { S3, PutObjectAclCommand } from "@aws-sdk/client-s3";
import {
  RekognitionClient,
  RecognizeCelebritiesCommand,
} from "@aws-sdk/client-rekognition";

// Array mit erlaubten MIME-Typen
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];

export const handler = async (event) => {
  const s3Client = new S3({});
  const rekognitionClient = new RekognitionClient({});

  // Extrahieren des Bucket-Namens und des Objektschlüssels aus dem Event (das von S3 an Lambda gesendet wird)
  const record = event.Records[0].s3;
  const bucket = record.bucket.name;
  const key = record.object.key;

  try {
    const headParams = {
      Bucket: bucket,
      Key: key,
    };
    // Erhalten der Metadaten des Objekts, um den MIME-Typ zu überprüfen
    const metadata = await s3Client.headObject(headParams);
    const contentType = metadata.ContentType;

    // Überprüfen, ob der MIME-Typ des Objekts in der Liste der erlaubten MIME-Typen enthalten ist
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      console.log(
        `Object ${key} has invalid MIME type: ${contentType}. Skipping recognition.`
      );
      return;
    }

    // Vorbereiten der Daten für die Rekognition-API
    const input = {
      Image: {
        S3Object: {
          Bucket: bucket,
          Name: key,
        },
      },
    };

    // Erkennen von Celebrities in dem Bild
    const commandForRec = new RecognizeCelebritiesCommand(input);
    const responseOfRec = await rekognitionClient.send(commandForRec);

    // Überprüfen, ob Celebrities im Bild erkannt wurden
    if (responseOfRec.CelebrityFaces.length === 0) {
      console.log("No celebrities found in file:", key);
      return;
    }

    // Ausgabe der erkannten Celebrities
    for (const person of responseOfRec.CelebrityFaces) {
      console.log("Found celebrity:", person.Name, "in file:", key);
    }
  } catch (err) {
    console.error("Error recognizing celebrities: ", err);
    return;
  }

  try {
    // Ändern der Zugriffsrechte des Objekts, um es öffentlich zu machen
    // Das Objekt wird hierbei für alle Benutzer lesbar gemacht
    const aclParams = {
      Bucket: bucket,
      Key: key,
      ACL: "public-read",
    };

    const commandForPublic = new PutObjectAclCommand(aclParams);
    const responseOfPublic = await s3Client.send(commandForPublic);

    console.log("File is now public:", responseOfPublic);
  } catch (err) {
    console.error("Error making file public: ", err);
  }
};
