import { MongoClient, MongoClientOptions } from "mongodb"
import { retry } from "./retry"
import { Logger } from "winston"

export interface MongoConnectionManagerOptions {
    retryAttempts?: number,
    retryInterval?: number,
}

export class AggregateError extends Error {
    errors: Error[]

    constructor(errors: Error[], message: string) {
        super(message)
        this.errors = errors
        Object.setPrototypeOf(this, AggregateError.prototype)  // Ensures the instance is of type AggregateError
    }
}

export class MongoConnectionManager {
    private client: MongoClient | null = null
    private connected: boolean = false
    private onConnectionChangedCallbacks: CallableFunction[] = []
    private connectionPromise: Promise<MongoClient> | null = null
    private retryAttempts: number
    private retryInterval: number

    constructor(private connectionString: string, private mongodbOptions?: MongoClientOptions, private options?: MongoConnectionManagerOptions, private logger?: Logger) {
        if (!connectionString) {
            throw new Error("❌ Connection string is required")
        }
        this.retryAttempts = options?.retryAttempts || 5
        this.retryInterval = options?.retryInterval || 1000
        this.logger?.info(`💫 MongoConnectionManager created with retryAttempts=${this.retryAttempts}, retryInterval=${this.retryInterval}`)
    }

    isConnnected(): boolean {
        return this.connected
    }

    onConnectionChanged(callback: CallableFunction) {
        this.onConnectionChangedCallbacks = [...this.onConnectionChangedCallbacks, callback]
    }

    async getClient(): Promise<MongoClient> {
        if (this.connectionPromise === null) {
            this.logger?.info("💫 Creating new connection promise")
            this.connectionPromise = this.createConnectionPromise()
        }
        return this.connectionPromise
    }

    private onConnect() {
        this.connected = true
        this.logger?.info("✅ Connected to MongoDB")
        let errors: Error[] = []
        this.onConnectionChangedCallbacks.forEach(callback => {
            try {
                callback()
            }
            catch (err) {
                if (err instanceof Error) {
                    errors.push(err)
                } else {
                    this.logger?.error("❌ Unkown exception in onConnectionChanged callback")
                }
            }
        })
        if (errors.length > 0) {
            throw new AggregateError(errors, "Errors occurred in onConnectionChanged callbacks")
        }
    }

    private onDisconnect() {
        this.connected = false
        this.logger?.warn("❌ Disconnected from MongoDB")
        let errors: Error[] = []
        this.onConnectionChangedCallbacks.forEach(callback => {
            try {
                callback()
            }
            catch (err) {
                if (err instanceof Error) {
                    errors.push(err)
                } else {
                    this.logger?.error("❌ Unkown exception in onConnectionChanged callback")
                }
            }
        })
        if (errors.length > 0) {
            throw new AggregateError(errors, "Errors occurred in onConnectionChanged callbacks")
        }
    }

    createConnectionPromise(): Promise<MongoClient> {

        const tryConnect: () => Promise<void> = () => new Promise<void>((resolve, reject) => {
            try {
                MongoClient.connect(this.connectionString, this.mongodbOptions)
                    .then((client) => {
                        this.client = client
                        this.client.on('serverClosed', () => {
                            this.logger?.warn("❌ MongoDB server closed")
                            this.onDisconnect()
                        })
                        this.client.on('error', (err) => {
                            this.logger?.error(`💥 MongoDB client error: ${err.message}`)
                            this.onDisconnect()
                        })
                        this.client.on('close', () => {
                            this.logger?.warn("❌ MongoDB client closed")
                            this.onDisconnect()
                        })
                        resolve()
                    }).catch((err) => {
                        if (err instanceof Error) {
                            this.logger?.error(`💥 Failed to connect to MongoDB: ${err.message}`)
                        } else {
                            this.logger?.error("💥 Failed to connect to MongoDB: Unknown error")
                        }
                        reject(err)
                    })
            }
            catch (err) {
                if (err instanceof Error) {
                    this.logger?.error(`💥 Unexpected error: ${err.message}`)
                    // check if there is stack and if in stack there is "at new ConnectionString" which indicates an error in connection string
                    if (err.stack && err.stack.includes("at new ConnectionString")) {
                        reject(new Error("❌ Invalid connection string"))
                    } else {
                        reject(err)
                    }
                } else {
                    this.logger?.error("💥 Unexpected error: Unknown error")
                    reject(new Error("Unexpected error"))
                }
            }
        })

        return new Promise<MongoClient>((resolve, reject) => {
            this.connected = false

            retry(tryConnect, this.retryAttempts, this.retryInterval).then(() => {
                if (this.client === null) {
                    const errorMessage = "❌ Client is null. This should never happen."
                    this.logger?.error(errorMessage)
                    throw new Error(errorMessage)
                }
                this.onConnect()
                resolve(this.client)
            }).catch((err) => {
                if (err instanceof Error) {
                    this.logger?.error(`💥 All retry attempts failed: ${err.message}`)
                } else {
                    this.logger?.error("💥 All retry attempts failed: Unknown error")
                }
                reject(err)
            })
        })
    }
}