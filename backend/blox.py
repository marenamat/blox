#!/usr/bin/python3

import asyncio
import websockets
import json
import tempfile
import sys

runner = None

class CodeRunException(Exception):
    def __init__(self, what, returncode, stdout, stderr):
        super().__init__(f"{what} failed: {returncode}")
        self.stdout = stdout
        self.stderr = stderr

class CodeBlock:
    def __init__(self, name, code):
        self._code = code
        self._name = name

    async def execute(self, args=""):
        lua = asyncio.create_subprocess_shell("lua",
                asyncio.subprocess.PIPE,
                asyncio.subprocess.PIPE)

        stdout, stderr = await lua.communicate(args + self._code)

        if lua.returncode != 0:
            raise CodeRunException(f"Lua run {self._name}", self._luac.returncode, stdout, stderr)

    def toJSON(self):
        return { "name": self._name, "code": self._code }

class Runner:
    def __init__(self, cfg="blox.conf"):
        self._handlers = {
                "devicelist": self.sendDeviceList
                }
        self._devices = {}
        self._clients = set()
        self.loadconf(cfg)

    def loadconf(self, cfg):
        try:
            self.cfg = json.load(open(cfg, "r"))
        except Exception as e:
            print(f"Failed to load configuration: {e}")
            sys.exit(1)

    async def websocket(self, socket, _):
        self._clients.add(socket)

        async for message in socket:
            obj = json.loads(message)
            if obj["msgID"] > 0 and obj["request"] in self._handlers:
                await self._handlers[obj["request"]](socket, obj)
            else:
                break

        self._clients.remove(socket)

    async def sendDeviceList(self, socket, obj):
        await socket.send(json.dumps({
            "msgID": obj["msgID"],
            "devices": dict(self._devices),
            }, cls=DeviceEncoder))

class Device:
    def __init__(self, name, displayName):
        self._name = name
        self._displayName = displayName

    def toJSON(self):
        return { "name": self._name, "displayName": self._displayName }

class DeviceEncoder(json.JSONEncoder):
    def default(self, obj):
        return obj.toJSON() if isinstance(obj, Device) else super().default(obj)

class Timer(Device):
    def __init__(self, timeout, callback, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self._timeout = timeout
        self._callback = callback
        self._task = None

    def activate(self, runner):
        self._task = asyncio.ensure_future(self.run(runner))

    def cancel(self):
        self._task.cancel()

    async def run(self):
        await asyncio.sleep(self._timeout)
        await self._callback.execute()

    def toJSON(self):
        out = super().toJSON()
        out["timeout"] = self._timeout
        out["callback"] = self._callback.toJSON
        out["active"] = 0 if self._task is None or self._task.done() else 1

async def main():
    runner = Runner()
    await websockets.serve(runner.websocket, host="", port=8099)

if __name__ == "__main__":
    asyncio.get_event_loop().run_until_complete(main())
    asyncio.get_event_loop().run_forever()
