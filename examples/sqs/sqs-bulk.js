const WorkerFactory = require('../../lib/index')
const logger = require('../support/logger')('[worker]')
const { failInTen } = require('../support/failer')

// gen worker
const { worker, publish } = WorkerFactory.createWorker({
  // worker label name
  name: 'RandomWorker',
  bulkSize: 10,
  // control queue
  broker: 'sqs',
  aws: {
    region: 'us-east-1'
  },
  queue: 'development-worker.fifo',

  // max number of executing callback per message
  max_try: 2,

  // (optional) smooth process of retry
  retry_timeout: 1000,

  // callback need return a promise
  callback(messages) {
    for (const msg of messages) {
      try {
        failInTen(8)
        msg.setSuccess({ ok: 'ok' })
      } catch (err) {
        msg.setFail(err)
      }
    }
  },

  failCallback(messages) {
    console.log('failed', messages.map(msg => msg.getError()))
    return messages
  },

  successCallback(messages) {
    console.log('success', messages.map(msg => msg.getSuccessPayload()))
    return messages
  }
})

worker.start()

const logLevels = ['debug', 'info', 'warn', 'error']

worker.on('log', (workerName, ...data) => {
  const [level, messages, action, additionalInfo] = data

  if (logLevels.indexOf(level) >= 0) {
    const extra =
      additionalInfo && additionalInfo.toString
        ? additionalInfo.toString()
        : JSON.stringify(additionalInfo || undefined)
    if (messages.length) {
      messages.forEach(msg => {
        const { message: errorMessage } = msg.getError() || {}
        logger[level]({
          workerName,
          messageId: msg.messageId(),
          tryCount: msg.tryCount(),
          contents: msg.toString(),
          action,
          errorMessage,
          extra
        })
      })
    } else {
      logger[level]({ workerName, action, extra })
    }
  }
})

publish({ a: 1 })
publish({ a: 3 })
publish({ a: 4 })
publish({ a: 5 })
publish({ a: 1 })
publish({ a: 3 })
publish({ a: 4 })
publish({ a: 5 })
publish({ a: 1 })
publish({ a: 3 })
publish({ a: 4 })
publish({ a: 5 })

publish({ a: 1 })
publish({ a: 3 })
publish({ a: 4 })
publish({ a: 5 })
publish({ a: 1 })
publish({ a: 3 })
publish({ a: 4 })
publish({ a: 5 })
publish({ a: 1 })
publish({ a: 3 })
publish({ a: 4 })
publish({ a: 5 })
