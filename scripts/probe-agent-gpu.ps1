$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;using System.Collections.Generic;using System.Runtime.InteropServices;
public static class HoutuGpuProbe {
 [StructLayout(LayoutKind.Sequential)]struct Luid{public uint Low;public int High;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Desc{
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string Name;
  public uint Vendor,Device,SubSystem,Revision;public UIntPtr Dedicated,DedicatedSystem,Shared;public Luid Luid;public uint Flags;
 }
 [DllImport("dxgi.dll",CallingConvention=CallingConvention.StdCall)]static extern int CreateDXGIFactory1(ref Guid id,out IntPtr factory);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Enumerate(IntPtr self,uint index,out IntPtr adapter);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Describe(IntPtr self,out Desc desc);
 public class Gpu{public string name,id;public ulong dedicatedBytes,sharedBytes;public uint vendorId,index;public bool software;public string source="DXGI_ADAPTER_DESC1";}
 static Delegate Method(IntPtr instance,int slot,Type type){return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance),slot*IntPtr.Size),type);}
 public static Gpu[] Read(){var list=new List<Gpu>();IntPtr factory;var id=new Guid("770aae78-f26f-4dba-a829-253c83d1b387");Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref id,out factory));
  try{var enumerate=(Enumerate)Method(factory,12,typeof(Enumerate));for(uint i=0;i<32;i++){IntPtr adapter;int code=enumerate(factory,i,out adapter);if(code!=0)break;try{Desc d;Marshal.ThrowExceptionForHR(((Describe)Method(adapter,10,typeof(Describe)))(adapter,out d));list.Add(new Gpu{name=d.Name,id=d.Luid.High.ToString("x8")+d.Luid.Low.ToString("x8"),dedicatedBytes=d.Dedicated.ToUInt64(),sharedBytes=d.Shared.ToUInt64(),vendorId=d.Vendor,index=i,software=(d.Flags&2)!=0});}finally{Marshal.Release(adapter);}}}finally{Marshal.Release(factory);}return list.ToArray();
 }
}
'@
@{gpus=@([HoutuGpuProbe]::Read());source='DXGI';verified=$true} | ConvertTo-Json -Depth 5 -Compress
