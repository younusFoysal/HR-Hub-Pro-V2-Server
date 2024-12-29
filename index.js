const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000


const corsOptions = {
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://hr-hub-pro.web.app',
    ],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())



const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token
    console.log(token)
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log(err)
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded
        next()
    })
}

// mongo db url mongodb+srv://linux:uL3SEh3LvCDz1RuY@cluster0.q3baw43.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.q3baw43.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
})

async function run() {
    try {
        const db = client.db('hrhubDB')
        const usersCollection = db.collection('users')
        const worksCollection = db.collection('works')
        const salaryCollection = db.collection('salary')
        const reviewCollection = db.collection('reviews')
        const messageCollection = db.collection('messages')


        // verify Admin 
        const verifyAdmin = async (req, res, next) => {
            console.log('hello from admin')
            const user = req.user
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)
            console.log(result?.role)
            if (!result || result?.role !== 'admin')
                return res.status(401).send({ message: 'unauthorized access!!' })
            next()
        }

        // verify hr
        const verifyHr = async (req, res, next) => {
            console.log('hello from HR')
            const user = req.user
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)
            console.log(result?.role)
            if (!result || result?.role !== 'hr') {
                return res.status(401).send({ message: 'unauthorized access!!' })
            }

            next()
        }
        // verify employee
        const verifyEmployee = async (req, res, next) => {
            console.log('hello from Employee')
            const user = req.user
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)
            console.log(result?.role)
            if (!result || result?.role !== 'employee') {
                return res.status(401).send({ message: 'unauthorized access!!' })
            }

            next()
        }

        // verifyAdminOrHr
        const verifyAdminOrHr = async (req, res, next) => {
            console.log('hello from Admin OR HR');
            const user = req.user;
            const query = { email: user?.email };
            const result = await usersCollection.findOne(query);
            console.log(result?.role);

            if (!result || (result.role !== 'admin' && result.role !== 'hr')) {
                return res.status(401).send({ message: 'unauthorized access!!' });
            }

            next();
        };



        // auth related api
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '365d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })

        // Logout
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
                console.log('Logout successful')
            } catch (err) {
                res.status(500).send(err)
            }
        })

        // create-payment-intent
        app.post('/create-payment-intent',verifyToken, verifyHr, async (req, res) => {
            const salary = req.body.salary
            const salaryInCent = parseFloat(salary) * 100
            if (!salary || salaryInCent < 1) return
            // generate clientSecret
            const { client_secret } = await stripe.paymentIntents.create({
                amount: salaryInCent,
                currency: 'usd',
                payment_method_types: ['card'],
                // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
                // automatic_payment_methods: {
                //   enabled: true,
                // },
            })
            // send client secret as response
            res.send({ clientSecret: client_secret })
        })


        // TODO: User DB
        // save a user data in db
        app.put('/user', async (req, res) => {
            const user = req.body

            const query = { email: user?.email }
            // check if user already exists in db

            const isExist = await usersCollection.findOne(query)
            if (isExist) {
                if (user.isVerfied === true) {
                    // if existing user try to change his role
                    const result = await usersCollection.updateOne(query, {
                        $set: { isVerfied: true },
                    })
                    return res.send(result)
                } else {
                    // if existing user login again
                    return res.send(isExist)
                }
            }

            // save user for the first time
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...user,
                    timestamp: Date.now(),
                },
            }
            console.log(updateDoc)
            const result = await usersCollection.updateOne(query, updateDoc, options)
            res.send(result)
        })

        // get a user info by email from db
        // Note: This Api is open, Because In login, we are checking that user is Fired or not.
        // So, That we can block him from login.
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.findOne({ email })
            res.send(result)
        })


        // get all users data from db
        app.get('/users', verifyToken, verifyAdminOrHr, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        // get employee users data from db
        app.get('/users-employee', verifyToken, verifyHr, async (req, res) => {
            const query = {role: "employee"}
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })

        // get verified employee users data from db
        app.get('/verified-employee', verifyToken, verifyAdmin, async (req, res) => {
            const query = {isVerfied: true}
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })



        //update a user role, isverify
        app.patch('/users/update/:email', verifyToken, verifyAdminOrHr, async (req, res) => {
            const email = req.params.email
            const user = req.body
            const query = { email }
            const updateDoc = {
                $set: { ...user, timestamp: Date.now() },
            }
            console.log(updateDoc)
            const result = await usersCollection.updateOne(query, updateDoc)
            res.send(result)
        })


        // TODO: Work DB   (verifyAdmin || verifyAdmin)
        // Get all works from db
        app.get('/works',  verifyToken, verifyHr, async (req, res) => {
            const category = req.query.category
            console.log(category)
            //let query = {}
            //if (category && category !== 'null') query = { category }
            const result = await worksCollection.find().toArray()
            res.send(result)
        })

        // Save a work data in db
        app.post('/work', verifyToken, verifyEmployee, async (req, res) => {
            const workData = req.body
            const result = await worksCollection.insertOne(workData)
            res.send(result)
        })

        // get all works for employee
        app.get('/my-works/:email', verifyToken, verifyEmployee, async (req, res) => {
                const email = req.params.email
                let query = { 'employee.email': email }
                const result = await worksCollection.find(query).toArray()
                res.send(result)
            }
        )

        // TODO: Salary or payment api
        // Save a salary data in db
        app.post('/paysalary', verifyToken, verifyHr, async (req, res) => {
            const salaryData = req.body
            const result = await salaryCollection.insertOne(salaryData)
            res.send(result)
        })

        // get all salary for a guest
        app.get('/my-salary/:email', verifyToken, verifyEmployee, async (req, res) => {
            const email = req.params.email
            const query = { email }
            const result = await salaryCollection.find(query).toArray()
            res.send(result)
        })

        // get all salary for a hr
        app.get('/salary', verifyToken, verifyHr, async (req, res) => {
            //const email = req.params.email
            //const query = { 'guest.email': email }
            const result = await salaryCollection.find().toArray()
            res.send(result)
        })

        // salary month and year of an employee
        app.get('/salarymonthyear/:email', verifyToken, verifyAdminOrHr, async (req, res) => {
            try {
                const email = req.params.email;
                const query = { email: email };

                // Fetch all salary records for the given email
                const results = await salaryCollection.find(query).toArray();

                // Extract the month and year fields and filter out duplicates
                const monthYearSet = new Set();
                const monthYearArray = results.map(result => ({
                    month: result.month,
                    year: result.year
                })).filter(item => {
                    const key = `${item.month}-${item.year}`;
                    if (!monthYearSet.has(key)) {
                        monthYearSet.add(key);
                        return true;
                    }
                    return false;
                });

                // Send the response
                res.send(monthYearArray);
            } catch (error) {
                res.status(500).send({ message: 'An error occurred', error: error.message });
            }
        });


        // salary vs month and year api for chart
        app.get('/salarysummary/:email', verifyToken, verifyHr, async (req, res) => {
            try {
                const email = req.params.email;
                const query = { email: email };

                // Fetch all salary records for the given email
                const results = await salaryCollection.find(query).toArray();

                // Map the results to extract month, year, and salary, and format the name
                const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
                const salarySummary = results.map(result => ({
                    name: `${monthNames[result.month - 1]} '${String(result.year).slice(-2)}`,
                    salary: result.salary
                }));

                // Send the response
                res.send(salarySummary);
            } catch (error) {
                res.status(500).send({ message: 'An error occurred', error: error.message });
            }
        });

        // TODO: Reviews
        // get all reviews data from db
        app.get('/reviews',  async (req, res) => {
            const result = await reviewCollection.find().toArray()
            res.send(result)
        })

        // TODO: Contact Messages
        //get all Messages data from db
        app.get('/contact', verifyToken, verifyAdmin, async (req, res) => {
            const result = await messageCollection.find().toArray()
            res.send(result)
        })

        // Save a msg data in db
        app.post('/contact',  async (req, res) => {
            const messageData = req.body
            const result = await messageCollection.insertOne(messageData)
            res.send(result)
        })

        // TODO: STATS
        // Employee
        app.get('/userStat/:email', verifyToken, verifyEmployee, async (req, res) => {
            const email = req.params.email;

            try {
                const worksQuery = { 'employee.email': email };
                const works = await worksCollection.find(worksQuery).toArray();
                const totalWorks = works.length;
                const totalWorkHours = works.reduce((acc, work) => acc + work.whrs, 0);
                const salaryQuery = { email };
                const salaries = await salaryCollection.find(salaryQuery).toArray();
                const totalSalaryEntries = salaries.length;
                const userStats = {
                    totalworks: totalWorks,
                    totalwhrs: totalWorkHours,
                    totalsalary: totalSalaryEntries
                };

                res.send(userStats);
            } catch (error) {
                console.error('Error fetching user stats:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });


        // HR stats
        app.get('/hrStat', verifyToken, verifyHr, async (req, res) => {
            try {
                const employeeQuery = { role: "employee" };
                const employees = await usersCollection.find(employeeQuery).toArray();
                const totalEmployees = employees.length;
                const query = {role: "employee", isVerfied: true}
                const result = await usersCollection.find(query).toArray()
                const totalVerifiedEmployees = result.length;
                const works = await worksCollection.find().toArray();
                const totalWorks = works.length;
                const hrStats = {
                    totalEmployees: totalEmployees,
                    totalverifiedEmployees: totalVerifiedEmployees,
                    totalWorks: totalWorks
                };

                res.send(hrStats);
            } catch (error) {
                console.error('Error fetching HR stats:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });

        // Admin stats
        app.get('/adminStat', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const employeeQuery = { role: "employee" };
                const employees = await usersCollection.find(employeeQuery).toArray();
                const totalEmployees = employees.length;
                const hrQuery = { role: "hr" };
                const hrEmployees = await usersCollection.find(hrQuery).toArray();
                const totalHr = hrEmployees.length;
                const messages = await messageCollection.find().toArray();
                const totalMessages = messages.length;
                const hrStats = {
                    totalEmployees: totalEmployees,
                    totalhr: totalHr,
                    totalmsg: totalMessages
                };

                res.send(hrStats);
            } catch (error) {
                console.error('Error fetching HR stats:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });



        // Send a ping to confirm a successful connection
        // await client.db('admin').command({ ping: 1 })
        console.log(
            'Pinged your deployment. You successfully connected to MongoDB!'
        )
    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('HR Hub Pro Server is Running...')
})


app.listen(port, () => {
    console.log(`HR Hub Pro Server is Running on port ${port}`)
})
