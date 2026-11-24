"""Export the official SRVGG checkpoints without importing or executing PyTorch pickle code.

Build tool only. Runtime distributions contain ONNX files and never require Python.
Architecture/weights: Real-ESRGAN, copyright 2021 Xintao Wang, BSD-3-Clause.
The convolution/PReLU/PixelShuffle/nearest-residual sequence follows
https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/realesrgan/archs/srvgg_arch.py
"""
import hashlib, io, json, pickle, sys, zipfile
from collections import OrderedDict
from pathlib import Path
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / '.cache' / 'superres-sources'
DEST = ROOT / 'models' / 'superres'
EXPECTED = {
    'realesr-general-x4v3': '8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292',
    'realesr-general-wdn-x4v3': '1641f8c4464b9f097c9fdda5589273713f67cf59f3d909e0bd688f0cee269dca',
    'realesr-animevideov3': 'b8a8376811077954d82ca3fcf476f1ac3da3e8a68a4f4d71363008000a18b75d',
}
class FloatStorage: pass
def rebuild(storage, offset, size, stride, requires_grad, hooks, metadata=None):
    return np.ndarray(tuple(size), dtype='<f4', buffer=storage, offset=offset*4,
                      strides=tuple(s*4 for s in stride)).copy()
class CheckpointReader(pickle.Unpickler):
    def __init__(self, data, archive, prefix):
        super().__init__(io.BytesIO(data)); self.archive=archive; self.prefix=prefix
    def find_class(self, module, name):
        allowed={('collections','OrderedDict'):OrderedDict,
                 ('torch','FloatStorage'):FloatStorage,
                 ('torch._utils','_rebuild_tensor_v2'):rebuild}
        if (module,name) not in allowed: raise ValueError('Unsupported checkpoint object: '+module+'.'+name)
        return allowed[(module,name)]
    def persistent_load(self, value):
        kind, dtype, key, location, count=value
        if kind!='storage' or dtype is not FloatStorage or not str(key).isdigit() or count>20_000_000:
            raise ValueError('Unsupported tensor storage')
        data=self.archive.read(self.prefix+'data/'+key)
        if len(data)!=count*4: raise ValueError('Tensor storage size mismatch')
        return data
def load(name):
    file=SOURCES/(name+'.pth'); raw=file.read_bytes(); digest=hashlib.sha256(raw).hexdigest()
    if digest!=EXPECTED[name]: raise ValueError('Checkpoint hash mismatch: '+name)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if len(archive.infolist())>1000 or sum(e.file_size for e in archive.infolist())>100_000_000:
            raise ValueError('Checkpoint archive exceeds bounds')
        pkl=next(n for n in archive.namelist() if n.endswith('/data.pkl'))
        result=CheckpointReader(archive.read(pkl),archive,pkl[:-len('data.pkl')]).load()
    return result.get('params_ema',result.get('params')),digest,len(raw)
def export(model_id, name, convs, inputs):
    states=[load(n) for n in inputs]; weights=states[0][0]
    if len(states)>1:
        if set(weights)!=set(states[1][0]): raise ValueError('Blended model keys differ')
        weights={k:(weights[k]*np.float32(.5)+states[1][0][k]*np.float32(.5)) for k in weights}
    nodes=[]; initializers=[]; x='input'
    for i in range(convs+2):
        index=i*2; weight=weights[f'body.{index}.weight']; bias=weights[f'body.{index}.bias']
        expected=(64,3,3,3) if i==0 else (48,64,3,3) if i==convs+1 else (64,64,3,3)
        if weight.shape!=expected or bias.shape!=(expected[0],): raise ValueError('Unexpected convolution shape')
        w=f'w{i}'; b=f'b{i}'; out=f'conv{i}'
        initializers += [numpy_helper.from_array(weight,w),numpy_helper.from_array(bias,b)]
        nodes.append(helper.make_node('Conv',[x,w,b],[out],pads=[1,1,1,1],strides=[1,1]))
        x=out
        if i!=convs+1:
            slope=weights[f'body.{index+1}.weight'].reshape(64,1,1)
            a=f'a{i}'; initializers.append(numpy_helper.from_array(slope,a)); x=f'relu{i}'
            nodes.append(helper.make_node('PRelu',[out,a],[x]))
    nodes.append(helper.make_node('DepthToSpace',[x],['prediction'],blocksize=4,mode='CRD'))
    initializers += [numpy_helper.from_array(np.array([],dtype=np.float32),'roi'),
                     numpy_helper.from_array(np.array([1,1,4,4],dtype=np.float32),'scales')]
    nodes.append(helper.make_node('Resize',['input','roi','scales'],['base'],mode='nearest',
                                  coordinate_transformation_mode='asymmetric',nearest_mode='floor'))
    nodes.append(helper.make_node('Add',['prediction','base'],['output']))
    graph=helper.make_graph(nodes,name,[helper.make_tensor_value_info('input',TensorProto.FLOAT,[1,3,'height','width'])],
                            [helper.make_tensor_value_info('output',TensorProto.FLOAT,[1,3,'height4','width4'])],initializers)
    model=helper.make_model(graph,opset_imports=[helper.make_opsetid('',17)],producer_name='houtu-studio official-checkpoint converter',ir_version=8)
    onnx.checker.check_model(model); file=DEST/(model_id+'.onnx'); onnx.save(model,file)
    return {'id':model_id,'file':file.name,'architecture':'SRVGGNetCompact','nativeScale':4,
            'convolutions':convs+2,'padding':40 if convs==32 else 24,
            'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size,
            'sources':[{'name':n,'sha256':states[i][1],'bytes':states[i][2],
                        'url':f'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/{n}.pth'} for i,n in enumerate(inputs)],
            'blend':'general 50% + weak-denoise 50%' if len(states)>1 else None}
DEST.mkdir(parents=True,exist_ok=True)
models=[export('general-x4v3-dn50','Real-ESRGAN General x4v3 DN50',32,['realesr-general-x4v3','realesr-general-wdn-x4v3']),
        export('animevideov3','Real-ESRGAN AnimeVideo v3',16,['realesr-animevideov3'])]
manifest={'schemaVersion':1,'license':'BSD-3-Clause','upstream':'https://github.com/xinntao/Real-ESRGAN',
          'architectureCommit':'a4abfb2979a7bbff3f69f58f58ae324608821e27','converter':{'onnx':onnx.__version__,'numpy':np.__version__,'opset':17},'models':models}
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest))
