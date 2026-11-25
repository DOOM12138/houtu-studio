"""Build the standalone APK from pinned local runtime archives; never reads user data."""
import argparse,hashlib,json,os,pathlib,secrets,shutil,subprocess,tarfile,zipfile,sys,re
ROOT=pathlib.Path(__file__).resolve().parent.parent
VERSION=json.loads((ROOT/'package.json').read_text('utf-8'))['version'];parts=[int(v) for v in VERSION.split('.')];assert len(parts)==3 and parts[1]<100 and parts[2]<100;VERSION_CODE=parts[0]*10000+parts[1]*100+parts[2]
parser=argparse.ArgumentParser();parser.add_argument('--abi',choices=['arm64-v8a','x86_64'],default='arm64-v8a');parser.add_argument('--sdk',default=os.environ.get('ANDROID_SDK_ROOT',os.environ.get('ANDROID_HOME','')));parser.add_argument('--jdk',default=os.environ.get('JAVA_HOME',''));parser.add_argument('--probe',action='store_true');parser.add_argument('--debug',action='store_true');args=parser.parse_args()
SDK=pathlib.Path(args.sdk);JDK=pathlib.Path(args.jdk);BT=SDK/'build-tools/36.0.0';ANDROID=SDK/'platforms/android-36/android.jar';WORK=ROOT/'tmp/android-build'/args.abi;CACHE=ROOT/'.cache/android';DEPS=ROOT/'.cache/android-node/node_modules'
if not ANDROID.is_file() or not (JDK/'bin/java.exe').is_file():raise SystemExit('Android SDK 36 and a JDK 21 path are required; use --sdk and --jdk.')
WORK.mkdir(parents=True,exist_ok=True)
assert not WORK.is_symlink() and WORK.resolve().parent==(ROOT/'tmp/android-build').resolve(),'Unexpected build directory'
for folder in ['assets','classes','dex','lib']:
    target=WORK/folder;assert not target.is_symlink() and target.resolve().parent==WORK.resolve(),'Unexpected build output path'
    if target.exists():shutil.rmtree(target)
    target.mkdir()
lock=json.loads((ROOT/'android/runtime-lock.json').read_text('utf-8'));archive=CACHE/'node-android.zip';assert hashlib.sha256(archive.read_bytes()).hexdigest()==lock['node']['sha256']
with zipfile.ZipFile(archive) as z:
    data=z.read('bin/'+args.abi+'/libnode.so');native=WORK/'lib'/args.abi;native.mkdir(exist_ok=True);(native/'libnode.so').write_bytes(data)
cxx=lock['libcxx']['abis'][args.abi];cxx_bytes=(ROOT/cxx['file']).read_bytes();assert hashlib.sha256(cxx_bytes).hexdigest()==cxx['sha256'];(native/'libc++_shared.so').write_bytes(cxx_bytes)
with zipfile.ZipFile(CACHE/'jna.aar') as z:
    (WORK/'jna-classes.jar').write_bytes(z.read('classes.jar'));(native/'libjnidispatch.so').write_bytes(z.read('jni/'+args.abi+'/libjnidispatch.so'))
entry=lock['codex']['archives']['aarch64' if args.abi=='arm64-v8a' else 'x86_64'];codex=CACHE/entry['file'];assert entry['nativeAndroid'] is True and hashlib.sha256(codex.read_bytes()).hexdigest()==entry['sha256']
with tarfile.open(codex,'r:gz') as t:
    report=json.load(t.extractfile('build.json'));expected=json.loads((ROOT/'android/codex-source.json').read_text());assert all(report[k]==v for k,v in expected.items()) and report['nativeAndroid'] is True and report['thirdPartyIdentityChanges']==0 and report['target']==('aarch64-linux-android' if args.abi=='arm64-v8a' else 'x86_64-linux-android')
    blob=t.extractfile(entry['member']).read();assert hashlib.sha256(blob).hexdigest()==entry['elfSha256']==report['sha256'] and len(blob)==report['bytes'];assert hashlib.sha256(t.extractfile('Cargo.lock').read()).hexdigest()==report['lockSha256'];(native/'libhoutu_codex.so').write_bytes(blob)
bundle=WORK/'assets/houtu-project.zip';count=0
with zipfile.ZipFile(bundle,'w',zipfile.ZIP_STORED) as z:
    for name in ['server.mjs','package.json','package-lock.json','LICENSE','README.md','SOURCES.md','PROMPT_LAB.md']:
        z.write(ROOT/name,name);count+=1
    for dirname in ['lib','backend','public','frontend','models','scripts','vendor-licenses']:
        for p in sorted((ROOT/dirname).rglob('*')):
            if p.is_file() and not p.is_symlink() and not p.name.endswith(('.map','.pyc')):z.write(p,p.relative_to(ROOT).as_posix());count+=1
    for p in sorted(DEPS.rglob('*')):
        if not p.is_file() or p.is_symlink() or p.name.endswith(('.map','.ts','.exe','.dll','.node')):continue
        rel=p.relative_to(DEPS).as_posix()
        if rel.startswith('onnxruntime-node/'):
            if any(s in rel for s in ['jsep','jspi','asyncify','webgpu','webgl','training','ort.min.js','ort.all','/lib/','/types/']):continue
            if p.suffix=='.wasm' and p.name!='ort-wasm-simd-threaded.wasm':continue
        if rel.startswith('@mediapipe/tasks-vision/') and not any(rel.endswith(s) for s in ['vision_bundle.mjs','vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm','package.json','LICENSE','NOTICE']):continue
        z.write(p,'node_modules/'+rel);count+=1
    for name in ['boot.mjs','probe.mjs']:z.write(ROOT/'android'/name,'android/'+name);count+=1
    z.writestr('android/build-config.json',json.dumps({'engineProbe':args.probe}));count+=1
    z.write(CACHE/'node-LICENSE','vendor-licenses/android-node-LICENSE');z.write(CACHE/'codex-LICENSE','vendor-licenses/codex-LICENSE')
(WORK/'assets/bundle.json').write_text(json.dumps({'sha256':hashlib.sha256(bundle.read_bytes()).hexdigest(),'files':count,'standalone':True}),encoding='utf-8')
env=os.environ.copy();env['JAVA_HOME']=str(JDK);env['PATH']=str(JDK/'bin')+os.pathsep+env.get('PATH','');env['TEMP']=env['TMP']=str(ROOT/'tmp')
def run(*cmd):
    def argument(v):
        if isinstance(v,pathlib.Path):
            try:return str(v.relative_to(ROOT))
            except ValueError:pass
        return str(v)
    result=subprocess.run([argument(v) for v in cmd],cwd=os.environ.get('HOUTU_ANDROID_BUILD_ROOT',str(ROOT)),env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    if result.stdout:sys.stdout.buffer.write(result.stdout);sys.stdout.flush()
    result.check_returncode()
policy_tests=WORK/'policy-tests';policy_tests.mkdir(exist_ok=True)
run(JDK/'bin/javac.exe','-encoding','UTF-8','--release','8','-d',policy_tests,ROOT/'android/src/cn/houtu/studio/UpdatePolicy.java',ROOT/'android/tests/UpdatePolicyTest.java')
run(JDK/'bin/java.exe','-cp',policy_tests,'cn.houtu.studio.UpdatePolicyTest')
resources=WORK/'resources.zip';run(BT/'aapt2.exe','compile','--dir',ROOT/'android/res','-o',resources)
manifest=(ROOT/'android/AndroidManifest.xml').read_text('utf-8');manifest=re.sub(r'android:versionCode="[^"]+"','android:versionCode="'+str(VERSION_CODE)+'"',manifest);manifest=re.sub(r'android:versionName="[^"]+"','android:versionName="'+VERSION+'"',manifest)
if args.debug:manifest=manifest.replace('<application ','<application android:debuggable="true" ')
(WORK/'AndroidManifest.xml').write_text(manifest,encoding='utf-8')
unsigned=WORK/'unsigned.apk';run(BT/'aapt2.exe','link','-o',unsigned,'-I',ANDROID,'--manifest',WORK/'AndroidManifest.xml','-A',WORK/'assets',resources)
sources=sorted((ROOT/'android/src').rglob('*.java'));run(JDK/'bin/javac.exe','-encoding','UTF-8','--release','8','-classpath',str(ANDROID)+os.pathsep+str((WORK/'jna-classes.jar').relative_to(ROOT)),'-d',WORK/'classes',*sources)
classes=WORK/'classes.jar'
with zipfile.ZipFile(classes,'w') as z:
    for p in sorted((WORK/'classes').rglob('*.class')):z.write(p,p.relative_to(WORK/'classes').as_posix())
run(BT/'d8.bat','--release','--min-api','29','--lib',ANDROID,'--output',WORK/'dex',classes,WORK/'jna-classes.jar')
with zipfile.ZipFile(unsigned,'a',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted((WORK/'dex').glob('*.dex')):z.write(p,p.name)
    for p in sorted(native.glob('*.so')):z.write(p,'lib/'+args.abi+'/'+p.name)
aligned=WORK/'aligned.apk';run(BT/'zipalign.exe','-f','-P','16','4',unsigned,aligned)
signing=ROOT/'data/android-signing';signing.mkdir(parents=True,exist_ok=True);password=signing/'password';key=signing/'houtu.p12'
if not password.exists():password.write_text(secrets.token_hex(32),encoding='ascii')
env['HOUTU_ANDROID_STOREPASS']=password.read_text('ascii').strip()
if not key.exists():run(JDK/'bin/keytool.exe','-genkeypair','-keystore',key,'-storetype','PKCS12','-storepass:env','HOUTU_ANDROID_STOREPASS','-keypass:env','HOUTU_ANDROID_STOREPASS','-alias','houtu','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Houtu Studio, O=Houtu Studio')
version=VERSION;output=ROOT/'release'/('houtu-studio-'+version+'-Android-'+args.abi+('-test' if args.debug else '')+'.apk');output.parent.mkdir(exist_ok=True)
if env.get('HOUTU_ANDROID_RELEASE')=='1':
    cert=subprocess.run([str(JDK/'bin/keytool.exe'),'-exportcert','-keystore',str(key),'-alias','houtu','-storepass:env','HOUTU_ANDROID_STOREPASS'],cwd=ROOT,env=env,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout
    expected=json.loads((ROOT/'android/signing-certificate.json').read_text('utf-8'))['sha256'];assert hashlib.sha256(cert).hexdigest()==expected,'Official Android signing certificate mismatch'
run(BT/'apksigner.bat','sign','--ks',key,'--ks-key-alias','houtu','--ks-pass','env:HOUTU_ANDROID_STOREPASS','--key-pass','env:HOUTU_ANDROID_STOREPASS','--out',output,aligned);run(BT/'apksigner.bat','verify','--verbose','--print-certs',output)
print(json.dumps({'apk':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,'abi':args.abi,'standalone':True,'files':count}))
