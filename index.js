require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://artify-server-site-six.vercel.app/",
    ],
    credentials: true,
  })
);
app.use(express.json());

const uri = "mongodb+srv://ArtworkDatabaseUser:v5jVPbdLVXdMFo1s@artify-server.8cutdod.mongodb.net/?appName=artify-server";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  await client.connect();

  const artworkDB = client.db("artworkDB");
  const artworkCollection = artworkDB.collection("artwork");
  const favoriteCollection = artworkDB.collection("favorite");
  const likesCollection = artworkDB.collection("likes");

  // same user can like same artwork only once
  await likesCollection.createIndex(
    { artworkId: 1, userEmail: 1 },
    { unique: true }
  );

  // ---------- ARTWORKS ----------
  app.post("/artworks", async (req, res) => {
    try {
      const formData = req.body;

      // ensure totalLike exists
      const payload = {
        totalLike: 0,
        ...formData,
      };

      const result = await artworkCollection.insertOne(payload);
      res.send(result);
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  app.get("/artworks", async (req, res) => {
    try {
      const result = await artworkCollection.find({}).toArray();
      res.send(result);
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  app.get("/artworks/recent", async (req, res) => {
    try {
      const result = await artworkCollection
        .find({})
        .sort({ uploadTime: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  // Get one artwork by id
  app.get("/artworks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const art = await artworkCollection.findOne({ _id: new ObjectId(id) });
      if (!art) return res.status(404).send({ error: "Not found" });
      res.send(art);
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  // generic update
  app.patch("/artworks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updatedData = req.body;

      const result = await artworkCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  app.delete("/artworks/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const result = await artworkCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount > 0) {
        res.send({ success: true, message: "Artwork deleted successfully" });
      } else {
        res.send({ success: false, message: "Artwork not found" });
      }
    } catch (err) {
      res.status(500).send({ success: false, message: err.message });
    }
  });

  //Like once per user
  app.patch("/artworks/:id/like", async (req, res) => {
    try {
      const { id } = req.params;
      const { userEmail } = req.body;

      if (!userEmail) {
        return res.status(400).send({ error: "userEmail required" });
      }

      const artworkId = new ObjectId(id);

      // insert like record (unique)
      await likesCollection.insertOne({
        artworkId,
        userEmail,
        createdAt: new Date(),
      });

      // increment like counter
      await artworkCollection.updateOne(
        { _id: artworkId },
        { $inc: { totalLike: 1 } }
      );

      const fresh = await artworkCollection.findOne(
        { _id: artworkId },
        { projection: { totalLike: 1 } }
      );

      res.send({
        liked: true,
        modifiedCount: 1,
        totalLike: fresh?.totalLike ?? 0,
      });
    } catch (err) {
      if (err?.code === 11000) {
        // already liked: send current totalLike
        const artworkId = new ObjectId(req.params.id);
        const fresh = await artworkCollection.findOne(
          { _id: artworkId },
          { projection: { totalLike: 1 } }
        );

        return res.status(409).send({
          liked: false,
          message: "Already liked",
          totalLike: fresh?.totalLike ?? 0,
        });
      }

      res.status(500).send({ error: err.message });
    }
  });

  // One-time repair: recalc totalLike from likes collection
  app.post("/admin/recalculate-likes", async (req, res) => {
    try {
      const grouped = await likesCollection
        .aggregate([{ $group: { _id: "$artworkId", count: { $sum: 1 } } }])
        .toArray();

      await artworkCollection.updateMany({}, { $set: { totalLike: 0 } });

      const ops = grouped.map((g) => ({
        updateOne: {
          filter: { _id: g._id },
          update: { $set: { totalLike: g.count } },
        },
      }));

      if (ops.length) await artworkCollection.bulkWrite(ops);

      res.send({ success: true, updated: ops.length });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  // ---------- FAVORITE ----------
  app.post("/favorite/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const favorite = req.body;

      if (!email) {
        return res.send({ success: false, message: "Email required" });
      }

      // ✅ Check if already added
      const alreadyAdded = await favoriteCollection.findOne({
        artworkId: favorite._id,
        myEmail: email,
      });

      if (alreadyAdded) {
        return res.send({
          success: false,
          alreadyAdded: true,
          message: "You are already added to favorite",
        });
      }

      const favoriteDoc = {
        artworkId: favorite._id,
        artworkPhotoUrl: favorite.artworkPhotoUrl,
        artworkTitle: favorite.artworkTitle,
        artistName: favorite.artistName,
        myEmail: email,
        createdAt: new Date(),
      };

      const result = await favoriteCollection.insertOne(favoriteDoc);

      res.send({
        success: true,
        insertedId: result.insertedId,
      });
    } catch (err) {
      res.status(500).send({
        success: false,
        message: err.message,
      });
    }
  });

  app.get("/favorite", async (req, res) => {
    try {
      const result = await favoriteCollection.find({}).toArray();
      res.send(result);
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });
  app.delete("/favorite/:id", async (req, res) => {
    try {
      const { id } = req.params;

      // ✅ Prevent invalid ObjectId crash
      if (!ObjectId.isValid(id)) {
        return res.send({
          success: false,
          message: "Invalid favorite ID",
        });
      }

      const result = await favoriteCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount === 1) {
        res.send({ success: true });
      } else {
        res.send({
          success: false,
          message: "Item not found",
        });
      }
    } catch (err) {
      res.status(500).send({ success: false, message: err.message });
    }
  });

  // await client.db("admin").command({ ping: 1 });
  console.log("Connected to MongoDB!");
}

run().catch(console.dir);

app.listen(port, () => console.log(`Server running on port ${port}`));
