/*
 *	BloX
 *
 *	(c) 2022 Maria Matejka <mq@jmq.cz>
 *
 *	Can be freely distributed and used under the terms of the GNU GPL.
 */

var connection
var devices

var erow

class Connection {
  constructor(onopen, unsolicited) {
    try {
//      this.socket = new WebSocket("wss://blox.jmq.cz/wss/")
//      this.socket = new WebSocket("ws://192.168.1.120:8099/wss/")
      this.socket = new WebSocket("ws://localhost:8099/wss/")
      this.socket.onopen = onopen
      this.socket.onmessage = this.recv
      this.socket.onerror = function() {
	erow.fatalError("Connection failed. Reload to retry.")
      }
    } catch (err) {
      erow.fatalError("Connection failed: " + err + " Reload to retry.")
      return
    }
    this.lastmsgID = 0
    this.pending = []
    this.unsolicited = unsolicited
  }

  send(o, onreply) {
    var oo = Object(o)
    oo.msgID = ( this.lastmsgID += 1 )
    var j = JSON.stringify(o)
    this.pending.push({ id: o.msgID, obj: o, onreply: onreply })
    this.socket.send(j)
    console.log("SENT: " + j)
  }

  recv(m) {
    console.log("RECV: " + m.data)
    var j = JSON.parse(m.data)
    if (j.msgID > 0) {
      if (connection.pending.length == 0) {
	erow.fatalError("Unexpected server response, no request pending")
	return
      }

      var p = connection.pending.shift()
      if (p.id != j.msgID)
      {
	erow.fatalError("Garbled server response, got ID " + j.msgID + ", expected " + p.id)
	return
      }

      p.onreply(p, j)
    } else {
      connection.unsolicited(j)
    }
  }
}

class DeviceList {
  constructor () {
    this.devmap = {}
    this.node = document.getElementById("devices")
    this.updateState()
  }

  updateState() {
    connection.send({ request: "devicelist" }, function (_, data) { devices.recvList(data) })
  }

  recvList(data) {
    console.log("this")
    console.log(this)
    this.devmap = data.devices
    var pending = new Set()
    for (var d in this.devmap)
      pending.add(d)

    var children = []
    for (var i = this.node.childNodes.length; i--; )
      if (this.node.childNodes[i].nodeType == Node.ELEMENT_NODE)
	children.unshift(this.node.childNodes[i])

    for (var n in children) {
      console.log(n)
      if (n.getAttribute("data-device-name") in pending) {
	pending.remove(n)
	/* TODO: update the device */
      } else {
	this.node.removeChild(n)
      }
    }

    console.log(pending)
    console.log(pending.keys())

    for (let d of pending.keys()) {
      console.log(d)
      var dev = this.devmap[d]
      console.log(dev)

      var nameTextNode = document.createTextNode(dev.displayName)
      var nameNode = document.createElement("span")
      nameNode.classList.add("device-name")
      nameNode.appendChild(nameTextNode)

      var devNode = document.createElement("div")
      devNode.setAttribute("data-device-name", dev.name)
      devNode.classList.add("device")
      devNode.appendChild(nameNode)

      this.node.appendChild(devNode)
    }
  }
}

class ErrorRow {
  constructor () {
    this.node = document.getElementById("erow")
  }

  fatalError(msg) {
    console.log("Fatal error: " + msg)
    var msgNode = document.createElement("p")
    var textNode = document.createTextNode(msg)
    msgNode.appendChild(textNode)
    this.node.appendChild(msgNode)
    this.node.classList.remove("erow-hide")
  }
}

class Controller {
  constructor() {
    this.toolbox = {
      "kind": "categoryToolbox",
      "contents": [
	{ "kind": "category", "name": "Variables", "custom": "VARIABLE" },
	{ "kind": "category", "name": "Basic", "contents": [
	  { "kind": "block", "type": "logic_compare" },
	  { "kind": "block", "type": "math_number" },
	  { "kind": "block", "type": "math_arithmetic" },
	]},
	{ "kind": "category", "name": "Control", "contents": [
	  { "kind": "block", "type": "controls_if" },
	  { "kind": "block", "type": "controls_repeat_ext" },
	]},
	{ "kind": "category", "name": "Functions", "custom": "PROCEDURE" },
//	{ "kind": "block", "type": "text" },
//	{ "kind": "block", "type": "text_print" },
      ]
    }

    this.workspace = Blockly.inject('controller', { toolbox: this.toolbox })
    this.workspace.addChangeListener(this.onUserChange)
  }

  onUserChange(event) {
    var code = Blockly.Lua.workspaceToCode(controller.workspace)
    console.log(code)

    code = Blockly.Python.workspaceToCode(controller.workspace)
    console.log(code)
  }
}

function init()
{
  erow = new ErrorRow()

  connection = new Connection(
    function() {
      devices = new DeviceList()
    },
    function() {
    }
  )

  controller = new Controller()

  document.getElementById("container").classList.toggle("inactive")
}

var initWait = function () {
  if (document.readyState == 'complete')
    setTimeout(init, 50)
  else
    setTimeout(initWait, 50)
}

window.onload = initWait
