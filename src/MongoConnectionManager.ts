import { MongoClient, MongoClientOptions } from "mongodb"
import { retry } from "./retry"

interface MongoConnectionManagerOptions {
    retryAttempts?: number,
    retryInterval?: number,
}

export class AggregateError extends Error {
    errors: Error[];

    constructor(errors: Error[], message: string) {
        super(message);
        this.errors = errors;
        Object.setPrototypeOf(this, AggregateError.prototype);  // Ensures the instance is of type AggregateError
    }
}

export class MongoConnectionManager {
    private client: MongoClient | null = null
    private connected: boolean = false
    private onConnectionChangedCallbacks: CallableFunction[] = []
    private connectionPromise: Promise<MongoClient> | null = null
    private retryAttempts: number;
    private retryInterval: number;

    constructor(private connectionString: string, private mongodbOptions?: MongoClientOptions, private options?: MongoConnectionManagerOptions) {
        this.retryAttempts = options?.retryAttempts || 5;
        this.retryInterval = options?.retryInterval || 1000;
    }

    isConnnected(): boolean {
        return this.connected
    }

    onConnectionChanged(callback: CallableFunction) {
        this.onConnectionChangedCallbacks = [...this.onConnectionChangedCallbacks, callback]
    }

    async getConnection(): Promise<MongoClient> {
        if (this.connectionPromise === null) {
            this.connectionPromise = this.createConnectionPromise();
        }
        return this.connectionPromise
    }

    private onConnect() {
        this.connected = true
        let errors: any[] = []
        this.onConnectionChangedCallbacks.forEach(callback => {
            try {
                callback()
            }
            catch (err) {
                errors = [...errors, err]
            }
        })
        if (errors.length > 0) {
            throw new AggregateError(errors, "Errors occurred in onConnectionChanged callbacks")
        }
    }

    private onDisconnect() {
        this.connected = true
        let errors: any[] = []
        this.onConnectionChangedCallbacks.forEach(callback => {
            try {
                callback()
            }
            catch (err) {
                errors = [...errors, err]
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
                        this.client = client;
                        this.client.on('serverClosed', () => {
                            this.onDisconnect()
                        })
                        this.client.on('error', () => {
                            this.onDisconnect()
                        })
                        this.client.on('close', () => {
                            this.onDisconnect()
                        })
                        resolve();
                    }).catch((err) => {
                        reject(err)
                    });
            }
            catch (err) {
                reject(err)
            }
        });

        return new Promise<MongoClient>((resolve, reject) => {
            this.connected = false

            retry(tryConnect, this.retryAttempts, this.retryInterval).then(() => {
                if (this.client === null) {
                    throw new Error("Client is null. This should never happen.")
                }
                this.onConnect()
                resolve(this.client);
            }).catch((err) => {
                reject(err);
            });
        })
    }
}