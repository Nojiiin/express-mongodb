import { MongoClient, MongoClientOptions } from "mongodb"

export class MongoConnectionManager {
    client : MongoClient | null = null
    connected : boolean = false
    onConnectionChangedCallbacks : CallableFunction[] = []

    constructor(connectionString : string, options? : MongoClientOptions){
        this.reconnect(connectionString, options)
    }

    isConnnected() : boolean { return  this.connected }

    onConnectionChanged(callback : CallableFunction){
        this.onConnectionChangedCallbacks = [...this.onConnectionChangedCallbacks, callback]
    }

    getConnection(){
        if(!this.isConnnected)
            throw new Error('connection is not ready')
        return this.client
    }

    reconnect(connectionString : string, options? : MongoClientOptions){
        this.connected = false
        this.client = new MongoClient(connectionString, options)
        this.client.connect().then(()=>{
            this.connected = true
            this.onConnectionChangedCallbacks.forEach(callback => {
                callback()
            })
        })
    }
}