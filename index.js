var fs = require('fs')
  , util = require('util')
  , events = require('events')
  , EventEmitter = events.EventEmitter

module.exports = function(opts) {
  return new FileWatcher(opts)
}

function FileWatcher(opts) {
  if (!opts) opts = {}
  if (opts.persistent == undefined) opts.persistent = true
  if (!opts.interval) opts.interval = 1000
  this.polling = 'polling' in opts ? opts.polling : process.platform == 'win32'
  this.opts = opts
  this.watchers = {}
}

util.inherits(FileWatcher, EventEmitter)

/**
 * Start watching the given file.
 */
FileWatcher.prototype.add = function(file) {
  var self = this

  // ignore files that don't exist or are already watched
  if (this.watchers[file] || !fs.existsSync(file)) return

  // remember the current mtime
  var mtime = fs.statSync(file).mtime

  // callback for both fs.watch and fs.watchFile
  function check() {
    fs.stat(file, function(err, stat) {
      var changed = err || stat.mtime > mtime
      if (changed && self.watchers[file]) {
        mtime = err ? -1 : stat.mtime
        self.emit('change', file, mtime)
      }
    })
  }

  if (this.polling) {
    fs.watchFile(file, this.opts, check)
    this.watchers[file] = { close: function() { fs.unwatchFile(file) }}
    return
  }

  try {
    // try using fs.watch ...
    this.watchers[file] = fs.watch(file, this.opts, check)
  }
  catch (err) {
    // emit fallback event if we ran out of file handles
    if (err.code == 'EMFILE') this.emit('fallback', this.poll())
    else this.emit('error', err)
  }
}

/**
 * Switch to polling mode. This method is invoked internally if the system
 * runs out of file handles.
 */
FileWatcher.prototype.poll = function() {
  if (this.polling) return
  this.polling = true
  var watched = Object.keys(this.watchers)
  this.removeAll()
  watched.forEach(this.add, this)
  return watched.length
}

/**
 * Lists all watched files.
 */
FileWatcher.prototype.list = function() {
  return Object.keys(this.watchers)
}

/**
 * Stop watching the given file.
 */
FileWatcher.prototype.remove = function(file) {
  var watcher = this.watchers[file]
  if (!watcher) return
  delete this.watchers[file]
  watcher.close()
}

/**
 * Stop watching all currently watched files.
 */
FileWatcher.prototype.removeAll = function() {
  this.list().forEach(this.remove, this)
}
