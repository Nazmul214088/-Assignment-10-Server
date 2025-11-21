const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
//middleware
app.use(cors());
app.use(express.json());
//kzS3Lzr8kLeDepUz
//ArtworkDatabaseUser
const uri =
  "mongodb+srv://ArtworkDatabaseUser:kzS3Lzr8kLeDepUz@cluster0.wsnudbo.mongodb.net/?appName=Cluster0";
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const artworkDB = client.db("artworkDB");
    const FavoriteCollection = artworkDB.collection("favorite");
    const artworkCollection = artworkDB.collection("artwork");
    // POST route to receive form data
    app.post("/artworks", async (req, res) => {
      const formData = req.body; // Get data from client
      console.log("Received Data:", formData);
      const result = await artworkCollection.insertOne(formData);
      // Send response to client
      res.send(result);
    });
    //get data database to server
    app.get("/artworks", async (req, res) => {
      try {
        const result = await artworkCollection.find({}).toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    // GET artworks sorted by newest (recent)
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
    //Delete operation
    app.delete("/artworks/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await artworkCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Item not found" });
        }
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    //Update data
    app.patch("/artworks/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $inc: { totalLike: 1 },
      };
      const result = await artworkCollection.updateOne(filter, {
        $set: updatedData,
      });
      res.send(result);
    });

    //insert data for my Favorite
    app.post("/favorite", async (req, res) => {
      const data = req.body;
      const result = await FavoriteCollection.insertOne(data);
      res.send(result);
    });

    //get favorite data
    app.get("/favorite", async (req, res) => {
      try {
        const result = await FavoriteCollection.find({}).toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });
    //delete favorite data
    app.delete("/favorite/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await FavoriteCollection.deleteOne(query);
      if (result.deletedCount > 0) {
        res.send({ success: true, message: "Favorite removed successfully" });
      } else {
        res.send({ success: false, message: "Item not found" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
