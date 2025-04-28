const express = require("express");
const cors = require("cors");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const app = express();
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://findjob-22996.web.app/",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// ! Verify JWT Middleware
const verifyJwtToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.5pbosvq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
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
    const jobsCollection = client.db("find-jobs").collection("jobs");
    const bidsCollection = client.db("find-jobs").collection("bids");

    // ! JwT Implementation from here

    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN, {
        expiresIn: "1d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "None" : "strict",
        })
        .send({ success: true });
    });

    // ! clear Token On Logout
    app.get("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "None" : "strict",
          maxAge: 0,
        })
        .send({ success: true });
    });

    //! Get All Jobs  From db
    app.get("/jobs", async (req, res) => {
      const result = await jobsCollection.find().toArray();
      res.send(result);
    });

    //! Get Single JOb Data From DB
    app.get("/job/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    //! Save a BId Data in DB
    app.post("/bid", async (req, res) => {
      const bidData = req.body;
      // ? check if it's a duplicate
      const query = {
        email: bidData.email,
        jobId: bidData.jobId,
      };
      const alreadyApplied = await bidsCollection.findOne(query);
      console.log(alreadyApplied);
      if (alreadyApplied) {
        return res
          .status(400)
          .send("You have already placed a bid on this job");
      }

      const result = await bidsCollection.insertOne(bidData);
      res.send(result);
    });
    //! Save a JOB Data in DB
    app.post("/job", async (req, res) => {
      const jobData = req.body;
      const result = await jobsCollection.insertOne(jobData);
      res.send(result);
    });

    //! Get all jobs posted by a specific user
    app.get("/jobs/:email", verifyJwtToken, async (req, res) => {
      const tokenEmail = req.user.email;
      const email = req.params.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { "buyer.email": email };
      const result = await jobsCollection.find(query).toArray();
      res.send(result);
    });
    //! Delete a JOb Data From DB
    app.delete("/job/:id", verifyJwtToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.deleteOne(query);
      res.send(result);
    });
    //! Update a JOb Data in DB
    app.put("/job/:id", verifyJwtToken, async (req, res) => {
      const id = req.params.id;
      const jobData = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...jobData,
        },
      };
      const result = await jobsCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    //! Get all bids for a user by email
    app.get("/my-bids/:email", verifyJwtToken, async (req, res) => {
      const tokenEmail = req.user.email;
      const email = req.params.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { email: email };
      const result = await bidsCollection.find(query).toArray();
      res.send(result);
    });
    //! Get all bids request for job owner by email
    app.get("/bid-request/:email", verifyJwtToken, async (req, res) => {
      const tokenEmail = req.user.email;
      const email = req.params.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { "buyer.email": email };
      const result = await bidsCollection.find(query).toArray();
      res.send(result);
    });

    //! Update Bid Status
    app.patch("/bid/:id", verifyJwtToken, async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: status,
      };
      const result = await bidsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //! Get All Jobs  From db for Pagination
    app.get("/all-jobs", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const filter = req.query.filter;
      const sort = req.query.sort;
      const search = req.query.search;
      let options = {};
      if (options) {
        options = { sort: { deadline: sort === "asc" ? 1 : -1 } };
      }
      let query = { job_title: { $regex: search, $options: "i" } };
      if (filter) {
        query.category = filter;
      }
      console.log(size, page);
      const result = await jobsCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });
    //! Get All Jobs data for count  From db
    app.get("/jobs-count", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      let query = { job_title: { $regex: search, $options: "i" } };
      if (filter) {
        query.category = filter;
      }
      const count = await jobsCollection.countDocuments(query);
      res.send({ count });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Find Jobs Server!");
});
app.listen(port, () => console.log(`Server is running on port ${port}`));
