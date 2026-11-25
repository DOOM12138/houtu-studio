"""Verify CI artifact provenance and package the locked Android/Bionic client."""
import argparse
import gzip
import hashlib
import io
import json
import pathlib
import struct
import tarfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = json.loads((ROOT / 'android/codex-source.json').read_text())
PROVENANCE = json.loads((ROOT / 'android/codex-build-artifacts.json').read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def elf_report(binary, machine):
    assert binary[:6] == b'\x7fELF\x02\x01', 'Expected a little-endian 64-bit ELF'
    kind, actual_machine = struct.unpack_from('<HH', binary, 16)
    assert kind == 3 and actual_machine == machine, 'Expected the target Android PIE'
    phoff = struct.unpack_from('<Q', binary, 32)[0]
    phsize, phcount = struct.unpack_from('<HH', binary, 54)
    loads, interpreter = [], None
    for i in range(phcount):
        ptype, flags, offset, address, _, size, _, alignment = struct.unpack_from('<IIQQQQQQ', binary, phoff + i * phsize)
        if ptype == 1:
            assert alignment >= 16384 and (offset - address) % 16384 == 0, 'ELF must support 16 KiB pages'
            loads.append(alignment)
        if ptype == 3:
            interpreter = binary[offset:offset + size].rstrip(b'\0').decode('ascii')
    assert loads and interpreter == '/system/bin/linker64', 'Expected the Android system linker'
    return {'interpreter': interpreter, 'loadAlignments': loads, 'machine': actual_machine}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--x64', required=True)
    parser.add_argument('--arm64', required=True)
    parser.add_argument('--output', default='release/android-client-runtime')
    args = parser.parse_args()
    out = pathlib.Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    archives, lock_hash = {}, None
    required = ['libhoutu_codex.so', 'build.json', 'platform.patch', 'Cargo.lock', 'LICENSE', 'NOTICE']
    for key, file, target, machine in [
        ('x86_64', args.x64, 'x86_64-linux-android', 62),
        ('aarch64', args.arm64, 'aarch64-linux-android', 183),
    ]:
        artifact = pathlib.Path(file).read_bytes()
        assert digest(artifact) == PROVENANCE['artifacts'][key]['sha256'], 'Unexpected CI artifact ZIP'
        with zipfile.ZipFile(io.BytesIO(artifact)) as z:
            files = [entry.filename for entry in z.infolist() if not entry.is_dir()]
            assert sorted(files) == sorted(required), 'Unexpected or duplicate artifact member'
            report = json.loads(z.read('build.json'))
            assert all(report[k] == v for k, v in SOURCE.items()), 'Build source/toolchain differs from lock'
            assert report['target'] == target and report['nativeAndroid'] is True
            assert report['thirdPartyIdentityChanges'] == 0
            binary = z.read('libhoutu_codex.so')
            assert digest(binary) == report['sha256'] and len(binary) == report['bytes']
            assert digest(z.read('Cargo.lock')) == report['lockSha256']
            assert lock_hash is None or lock_hash == report['lockSha256'], 'ABI builds must share the dependency lock'
            lock_hash = report['lockSha256']
            elf = elf_report(binary, machine)
            name = 'codex-app-server-' + SOURCE['version'] + '-Android-' + key + '.tar.gz'
            output = out / name
            with output.open('wb') as stream:
                with gzip.GzipFile(filename='', mode='wb', fileobj=stream, mtime=0) as gz:
                    with tarfile.open(fileobj=gz, mode='w') as tar:
                        for item in required:
                            data = z.read(item)
                            info = tarfile.TarInfo(item)
                            info.size, info.mtime = len(data), 0
                            info.mode = 0o755 if item.endswith('.so') else 0o644
                            tar.addfile(info, io.BytesIO(data))
            archives[key] = {'file': name, 'sha256': digest(output.read_bytes()), 'member': 'libhoutu_codex.so',
                             'elfSha256': report['sha256'], 'bytes': report['bytes'], 'nativeAndroid': True,
                             'elf': elf, 'build': report}
    manifest = {'source': SOURCE, 'provenance': PROVENANCE, 'archives': archives}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (out / 'SHA256SUMS').write_text(''.join(v['sha256'] + '  ' + v['file'] + '\n' for v in archives.values()))
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
