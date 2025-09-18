const express = require("express");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const path = require("path");
const {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = 3000;

app.use(fileUpload());
app.use(express.static("public")); // serve index.html + style.css

// Configure LocalStack S3 client
//const s3Client = new S3Client({
//region: "us-east-1",
//endpoint: "http://127.0.0.1:4566", // 👈 force IPv4
//
//forcePathStyle: true,
//  credentials: { accessKeyId: "foo", secretAccessKey: "bar" },
//});

//const BUCKET_NAME = "my-cool-local-bucket";

// Configure AWS S3 client (will use EC2 instance role credentials automatically)
const s3Client = new S3Client({
  region: "us-east-2", // 👈 must match your bucket region
});

const BUCKET_NAME = "my-production-upload-bucket"; // 👈 your real bucket

const UPLOAD_TEMP_PATH = "./uploads";
if (!fs.existsSync(UPLOAD_TEMP_PATH)) fs.mkdirSync(UPLOAD_TEMP_PATH);

// =======================
// Upload endpoint
// =======================
app.post("/upload", async (req, res) => {
  try {
    if (!req.files?.image) return res.status(400).send("No file uploaded");

    const file = req.files.image;
    const tempPath = path.join(UPLOAD_TEMP_PATH, file.name);
    await file.mv(tempPath);

    const fileData = fs.readFileSync(tempPath);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: file.name,
        Body: fileData,
      })
    );

    fs.unlinkSync(tempPath);
    res.status(200).send("✅ File uploaded successfully!");
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("❌ Upload failed!");
  }
});

// =======================
// JSON list for AJAX
// =======================
app.get("/list-json", async (req, res) => {
  try {
    const response = await s3Client.send(
      new ListObjectsV2Command({ Bucket: BUCKET_NAME })
    );
    res.json(response.Contents || []);
  } catch (err) {
    console.error("List error:", err);
    res.status(500).json([]);
  }
});

// =======================
// Download with signed URL
// =======================
app.get("/download/:filename", async (req, res) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: req.params.filename,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    res.redirect(url); // 👈 auto-redirect to download
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("❌ Could not generate download link!");
  }
});

// =======================
// Start server
// =======================
app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
