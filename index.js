const co = require("co")
const amqplib = require("amqplib")
const uuidv4 = require('uuid/v4');

// factory
const chanceOfFail = 8

const wait = milisseconds =>
  new Promise(resolve => setTimeout(resolve, milisseconds))

const WorkerFactory = (connectUrl, opts = {}) => {

  const { logger } = opts

  // logger wrapper 
  const loggerW = {
    info(...args) {
      if (logger && logger.info)
        logger.info(...args)
    },

    error(...args) {
      if (logger && logger.error)
        logger.error(...args)
    }, 
    debug(...args) {
      if (logger && logger.debug)
        logger.debug(...args)
    }
  }

  const _conn = amqplib.connect(connectUrl)

  // return workerFactory
  return {

    createWorker: meta => {

      const { 
        name, 
        max_try = 1, retry_timeout,
        callback, failCallback, successCallback,
        queue, publishIn = {}
      } = meta

      const { exchange, routingKey } = publishIn
      
      const requeue = co.wrap(function*(message, executionId) {
        const conn = yield _conn
        const ch = yield conn.createChannel()

        try {

          const ok = yield ch.assertQueue(queue)
          
          if (ok) {
            ch.sendToQueue(queue, new Buffer(JSON.stringify(message)))
            loggerW.debug(name, "publishing", executionId, message)
          }

          ch.close()
          
          return true

        } catch (err) {

          ch.close()
          throw err
        }
      })

      const publish = co.wrap(function*(message) {
        const conn = yield _conn
        const ch = yield conn.createChannel()

        try {

          if (exchange && routingKey)
            ch.publish(exchange, routingKey ,  new Buffer(JSON.stringify(message)))
          else if(queue)
            ch.sendToQueue(queue, new Buffer(JSON.stringify(message)))
          else 
            throw new Error("no exchange & routingKey specified or a simple queue")

          loggerW.debug(name, "publishing", message)

          ch.close()
          
          return true

        } catch (err) {

          ch.close()
          throw err
        }
      })

      const worker = {

        start: co.wrap(function*() {

          const self = this
          const conn = yield _conn
          
          const ch = yield conn.createChannel()

          const ok = yield ch.assertQueue(queue)
          
          if(ok) {

            ch.consume(queue, msg => {
              const executionId = uuidv4()

              co(function*() {

                try {
                  
                  const message = JSON.parse(msg.content.toString())
                  
                  try {
                    loggerW.debug(name, executionId, "try callback")
                    
                    yield callback(message)
                    
                    if (successCallback) {

                      successCallback(message)
                        .then(res => 
                          loggerW.debug(name, executionId, "success callback", ...res)
                        )
                        .catch(err => 
                          loggerW.error(name, executionId, "success callback error", ...err)
                        )
                    }

                  } catch (err) {
                    loggerW.error(name, executionId, err.message)

                    if (message.retry)
                      ++message.retry
                    else
                      message.retry = 1

                    if (message.retry < max_try) {

                      /* smoth the retry process */ 
                      if(retry_timeout)
                        yield wait(retry_timeout).catch(loggerW.error)
                        
                      requeue(message, executionId)

                    } else {

                      if (failCallback)
                        failCallback(message)
                        .then(res => 
                          loggerW.debug(name, executionId, "fail callback success", ...res)
                        )
                        .catch(err => 
                          loggerW.error(name, executionId, "fail callback error", ...err)
                        )
                    }

                  } finally {
                    ch.ack(msg)
                  }
                } catch (err) {
                  loggerW.error(name, executionId, err)
                  ch.ack(msg)
                }
              })
            })
          } else {
            if (logger.error)
              logger.error(`no queue: ${queue}`)
          }
        }) // end start
      }

      return { worker , publish }
    }
  }
}

module.exports = WorkerFactory
