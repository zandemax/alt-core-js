import protobuf = require('protobufjs');
import fs = require('fs');
import path = require('path');

export function resolveImportPath(origin: string, target: string): string {
    let currentDir = path.dirname(origin);

    while (
        !fs.existsSync(path.resolve(currentDir, target)) &&
        path.parse(currentDir).root !== currentDir
    ) {
        currentDir = path.resolve(currentDir, '..');
    }

    return path.resolve(currentDir, target);
}

export function encodeProto(
    protoDefPath: string,
    attributes: {},
    outerClass: string,
): Uint8Array {
    const root = new protobuf.Root();
    root.resolvePath = resolveImportPath;
    root.loadSync(protoDefPath);
    const messageType = root.lookupType(outerClass);

    const errMsg = messageType.verify(attributes);
    if (errMsg) {
        throw Error(errMsg);
    }

    const message = messageType.fromObject(attributes);
    return messageType.encode(message).finish();
}

export function decodeProto(
    protoDefPath: string,
    outerClass: string,
    buffer: Uint8Array,
) {
    const root = new protobuf.Root();
    root.resolvePath = resolveImportPath;
    root.loadSync(protoDefPath);
    const messageType = root.lookupType(outerClass);
    const message = messageType.decode(buffer);
    const messageObject = messageType.toObject(message);

    const errMsg = messageType.verify(messageObject);
    if (errMsg) {
        throw Error(errMsg);
    }

    return messageObject;
}
