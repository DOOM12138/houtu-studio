using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program {
    internal static string Root, Session = Guid.NewGuid().ToString();
    internal static bool Smoke;
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [STAThread] static int Main(string[] args) {
        Root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
        Smoke = Array.IndexOf(args, "--smoke-test") >= 0;
        try {
            var package = Read(Path.Combine(Root,"package.json"));
            if (Convert.ToString(package["name"]) != "anime-paint-studio") throw new Exception("请从完整安装目录启动程序。");
            foreach (string name in new[]{"tmp","data"}) Directory.CreateDirectory(Path.Combine(Root,name));
            foreach (string name in new[]{"TEMP","TMP","TMPDIR"}) Environment.SetEnvironmentVariable(name,Path.Combine(Root,"tmp"));
            string key; using(var sha=SHA256.Create()) key=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Root.ToLowerInvariant()))).Replace("-","");
            bool fresh; using(var mutex = new Mutex(true,"Local\\HoutuStudio_"+key,out fresh)) {
                if(!fresh && Array.IndexOf(args,"--shutdown")>=0) {try{var record=Read(Path.Combine(Root,"data/desktop-session.json"));var pid=Convert.ToInt32(record["pid"]);Write(Path.Combine(Root,"data/desktop-close-request.json"),new{sessionId=Convert.ToString(record["sessionId"])});for(int i=0;i<200;i++){try{Process.GetProcessById(pid);}catch{return 0;}try{var response=Read(Path.Combine(Root,"data/desktop-close-result.json"));if(Convert.ToString(response["sessionId"])==Convert.ToString(record["sessionId"])&&Convert.ToString(response["status"])=="busy")return 2;}catch{}Thread.Sleep(100);}return 1;}catch{return 1;}}
                if(fresh && Array.IndexOf(args,"--shutdown")>=0)return 0;
                if(!fresh) { try {var record=Read(Path.Combine(Root,"data/desktop-session.json"));var process=Process.GetProcessById(Convert.ToInt32(record["pid"]));if(String.Equals(process.MainModule.FileName,Application.ExecutablePath,StringComparison.OrdinalIgnoreCase)){ShowWindow(process.MainWindowHandle,9);SetForegroundWindow(process.MainWindowHandle);}}catch{}return 0; }
                Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new StudioWindow());
            }
            return 0;
        } catch(Exception error) { if(Smoke) Write(Path.Combine(Root,"tmp/desktop-smoke.json"),new{result="FAIL",error=error.Message});else MessageBox.Show(error.Message,"厚涂小站",MessageBoxButtons.OK,MessageBoxIcon.Error); return 1; }
    }
    internal static Dictionary<string,object> Read(string file) {return Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file,Encoding.UTF8));}
    internal static void Write(string file,object value) { Directory.CreateDirectory(Path.GetDirectoryName(file));string temporary=file+"."+Guid.NewGuid().ToString()+".tmp";File.WriteAllText(temporary,Json.Serialize(value),new UTF8Encoding(false));if(File.Exists(file))File.Delete(file);File.Move(temporary,file); }
}

internal sealed class StudioWindow : Form {
    readonly WebView2 view=new WebView2();
    readonly Label message=new Label();
    readonly StatusStrip exportsBar=new StatusStrip();
    readonly ToolStripStatusLabel exportText=new ToolStripStatusLabel();
    readonly ToolStripStatusLabel exportFolder=new ToolStripStatusLabel("打开导出目录"){IsLink=true};
    readonly NotifyIcon tray=new NotifyIcon();
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
    readonly HttpClient http=new HttpClient(new HttpClientHandler{UseProxy=false});
    string origin,instance,csrf; bool busy,allowClose,checking,ownedServer,exiting;
    Dictionary<string,object> health;
    public StudioWindow() {
        Text="厚涂小站";Width=1440;Height=960;MinimumSize=new Size(920,650);StartPosition=FormStartPosition.CenterScreen;
        AutoScaleMode=AutoScaleMode.Dpi;Font=new Font("Microsoft YaHei UI",10);Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        message.Text="正在打开厚涂小站…\n照片与工作流保存在本机。";message.TextAlign=ContentAlignment.MiddleCenter;message.Dock=DockStyle.Fill;message.BackColor=Color.FromArgb(247,246,242);message.ForeColor=Color.FromArgb(44,47,45);
        view.Dock=DockStyle.Fill;view.Visible=false;Controls.Add(view);Controls.Add(message);exportsBar.Items.Add(exportText);exportsBar.Items.Add(exportFolder);
        exportFolder.Click+=(s,e)=>{try{Process.Start(new ProcessStartInfo(Path.Combine(Program.Root,"data","exports")){UseShellExecute=true});}catch{}};
        Controls.Add(exportsBar);exportsBar.Visible=false;
        var menu=new ContextMenuStrip();menu.Items.Add("打开厚涂小站",null,(s,e)=>Restore());menu.Items.Add("检查更新",null,(s,e)=>{Restore();if(origin!=null)view.CoreWebView2.Navigate(origin+"/server/#software-updates");});menu.Items.Add("退出程序",null,async(s,e)=>await Exit());
        tray.Icon=Icon;tray.Text="厚涂小站";tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,e)=>Restore();
        http.Timeout=TimeSpan.FromSeconds(2);timer.Interval=1500;timer.Tick+=async(s,e)=>await Tick();
        Shown+=async(s,e)=>await Start();FormClosing+=Closing;FormClosed+=(s,e)=>{timer.Stop();tray.Dispose();view.Dispose();http.Dispose();try{var record=Program.Read(Path.Combine(Program.Root,"data/desktop-session.json"));if(Convert.ToString(record["sessionId"])==Program.Session)File.Delete(Path.Combine(Program.Root,"data/desktop-session.json"));}catch{}};
    }
    void Restore(){Show();WindowState=FormWindowState.Normal;Activate();tray.Visible=false;}
    bool Own(string url){Uri u;return origin!=null&&Uri.TryCreate(url,UriKind.Absolute,out u)&&u.GetLeftPart(UriPartial.Authority)==origin;}
    void External(string url){Uri u;if(Uri.TryCreate(url,UriKind.Absolute,out u)&&u.Scheme=="https"&&String.IsNullOrEmpty(u.UserInfo))try{Process.Start(new ProcessStartInfo(u.AbsoluteUri){UseShellExecute=true});}catch{MessageBox.Show("无法打开系统浏览器，请检查默认浏览器设置。","厚涂小站");}}
    async Task Start(){
        try{
            string runtime=CoreWebView2Environment.GetAvailableBrowserVersionString();
            if(String.IsNullOrEmpty(runtime))throw new WebView2RuntimeNotFoundException();
            ownedServer=!await Registered();
            var start=new ProcessStartInfo(Path.Combine(Program.Root,"runtime/node.exe"),"\""+Path.Combine(Program.Root,"launcher.mjs")+"\" --no-open") {WorkingDirectory=Program.Root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
            using(var child=Process.Start(start)){var output=child.StandardOutput.ReadToEndAsync();var errors=child.StandardError.ReadToEndAsync();await Task.Run(()=>child.WaitForExit());await output;string error=await errors;if(child.ExitCode!=0)throw new Exception("本机服务未能启动。"+error);}
            if(!await Registered())throw new Exception("本机服务尚未就绪，请重新打开程序。");
            Program.Write(Path.Combine(Program.Root,"data/desktop-session.json"),new{schemaVersion=1,pid=Process.GetCurrentProcess().Id,sessionId=Program.Session,root=Program.Root});
            var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Program.Root,"data/desktop-webview"));
            await view.EnsureCoreWebView2Async(environment);
            var core=view.CoreWebView2;core.Settings.AreHostObjectsAllowed=false;core.Settings.IsWebMessageEnabled=true;core.Settings.IsStatusBarEnabled=false;core.Settings.AreDevToolsEnabled=Program.Smoke;core.Settings.AreBrowserAcceleratorKeysEnabled=false;core.Settings.IsZoomControlEnabled=true;
            string exports=Path.Combine(Program.Root,"data","exports");Directory.CreateDirectory(exports);core.Profile.DefaultDownloadFolderPath=exports;
            await core.AddScriptToExecuteOnDocumentCreatedAsync("window.houtuDesktopExports=true;");
            core.WebMessageReceived+=ExportMessage;
            core.DownloadStarting+=ExportStarted;
            core.NavigationStarting+=(s,e)=>{if(!Own(e.Uri)){e.Cancel=true;if(e.IsUserInitiated||e.Uri.StartsWith("https://auth.openai.com/",StringComparison.Ordinal))External(e.Uri);}};
            core.FrameNavigationStarting+=(s,e)=>{if(!Own(e.Uri)&&e.Uri!="about:blank")e.Cancel=true;};
            core.NewWindowRequested+=(s,e)=>{e.Handled=true;if(Own(e.Uri))core.Navigate(e.Uri);else External(e.Uri);};
            core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;
            core.NavigationCompleted+=async(s,e)=>{if(!e.IsSuccess)return;view.Visible=true;message.Visible=false;if(Program.Smoke)await Smoke();};
            core.ProcessFailed+=(s,e)=>{message.Text="图片窗口已停止。关闭后重新打开程序即可恢复已保存的工作流。";message.Visible=true;view.Visible=false;};
            core.Navigate(origin+"/workbench/");timer.Start();
        }catch(WebView2RuntimeNotFoundException){
            if(Program.Smoke){Failure("WebView2 Runtime is missing");return;}
            message.Text="需要安装 Microsoft WebView2 才能打开图片工作台。\n照片和账号仍保存在本机。";
            var button=new Button{Text="安装组件并继续",AutoSize=true,Anchor=AnchorStyles.None};Controls.Add(button);button.Location=new Point((ClientSize.Width-button.Width)/2,ClientSize.Height/2+55);button.BringToFront();
            button.Click+=async(s,e)=>{button.Enabled=false;try{var p=Process.Start(new ProcessStartInfo(Path.Combine(Program.Root,"runtime/MicrosoftEdgeWebview2Setup.exe"),"/silent /install"){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Program.Root});await Task.Run(()=>p.WaitForExit());if(p.ExitCode!=0)throw new Exception("组件安装尚未完成，请检查网络后重试。");Controls.Remove(button);await Start();}catch(Exception error){MessageBox.Show(error.Message,"厚涂小站");button.Enabled=true;}};
        }catch(Exception error){if(Program.Smoke)Failure(error.Message);else message.Text="暂时无法打开工作台\n\n"+error.Message+"\n\n请重新打开程序，或查看 data 中的本机日志。";}
    }
    async Task<bool> Registered(){try{var record=Program.Read(Path.Combine(Program.Root,"data/server.json"));int port=Convert.ToInt32(record["port"]);if(port<1024||port>65535)return false;string candidate="http://127.0.0.1:"+port;var h=Program.Json.Deserialize<Dictionary<string,object>>(await http.GetStringAsync(candidate+"/api/health"));if(Convert.ToString(h["app"])!="houtu-studio"||Convert.ToString(record["instanceId"])!=Convert.ToString(h["instanceId"]))return false;origin=candidate;health=h;instance=Convert.ToString(h["instanceId"]);csrf=Convert.ToString(h["csrf"]);busy=!h.ContainsKey("busy")||Convert.ToBoolean(h["busy"]);return true;}catch{return false;}}
    bool Updating(){try{var state=Program.Read(Path.Combine(Program.Root,".cache/updates/state.json"));if(Convert.ToString(state["status"])!="applying")return false;Guid id;if(!Guid.TryParse(Convert.ToString(state["id"]),out id))return false;var worker=Program.Read(Path.Combine(Program.Root,".cache/updates/"+id+"/worker.json"));string status=Convert.ToString(worker["status"]);return new[]{"waiting-for-stop","backing-up","verifying","applying","restarting"}.Contains(status);}catch{return false;}}
    async Task Tick(){if(checking||exiting)return;checking=true;try{try{var request=Program.Read(Path.Combine(Program.Root,"data/desktop-close-request.json"));if(Convert.ToString(request["sessionId"])==Program.Session){if(busy){Program.Write(Path.Combine(Program.Root,"data/desktop-close-result.json"),new{sessionId=Program.Session,status="busy"});File.Delete(Path.Combine(Program.Root,"data/desktop-close-request.json"));}else{await Exit();return;}}}catch{}string previous=origin;if(!await Registered()){if(Updating()){allowClose=true;Close();return;}message.Text="正在重新连接本机工作台…\n已保存的照片与步骤仍保留。";message.Visible=true;view.Visible=false;}else if(origin!=previous||!view.Visible){view.CoreWebView2.Navigate(origin+"/");}}finally{checking=false;}}
    async Task StopServer(){if(origin==null)return;await Registered();using(var request=new HttpRequestMessage(HttpMethod.Post,origin+"/api/shutdown")){request.Headers.Add("Origin",origin);request.Headers.Add("X-Paint-CSRF",csrf);request.Content=new StringContent(Program.Json.Serialize(new{instanceId=instance}),Encoding.UTF8,"application/json");var result=await http.SendAsync(request);result.EnsureSuccessStatusCode();}}
    async Task Exit(){if(exiting)return;if(busy&&MessageBox.Show("仍有图片或工作流正在处理。退出会中断当前步骤，已保存的结果会保留。\n\n停止处理并退出？","厚涂小站",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;exiting=true;try{await StopServer();allowClose=true;Close();}catch(Exception error){exiting=false;MessageBox.Show("服务未能停止："+error.Message,"厚涂小站");}}
    async void Closing(object sender,FormClosingEventArgs e){if(allowClose)return;e.Cancel=true;if(busy&&!Program.Smoke){Hide();tray.Visible=true;tray.ShowBalloonTip(3500,"厚涂小站","图片仍在后台处理，双击托盘图标返回。",ToolTipIcon.Info);return;}if(exiting)return;exiting=true;try{if(ownedServer)await StopServer();allowClose=true;Close();}catch{exiting=false;Restore();}}
    async void ExportMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e){
        if(!Own(e.Source))return;
        try{
            var message=Program.Json.Deserialize<Dictionary<string,object>>(e.TryGetWebMessageAsString());
            if(message==null||!message.ContainsKey("type")||!message.ContainsKey("url")||Convert.ToString(message["type"])!="saveExport")return;
            var address=Convert.ToString(message["url"]);
            Uri uri;
            if(!Own(address)||!Uri.TryCreate(address,UriKind.Absolute,out uri)||uri.UserInfo.Length!=0)return;
            const string id="[a-f0-9-]{36}";
            var path=uri.AbsolutePath;
            bool permitted=System.Text.RegularExpressions.Regex.IsMatch(path,"^/api/(?:logs/exports|studio/downloads|desktop/downloads)/"+id+"$")||
                System.Text.RegularExpressions.Regex.IsMatch(path,"^/api/image-imports/"+id+"/original$")||
                System.Text.RegularExpressions.Regex.IsMatch(path,"^/api/layers/"+id+"/project$")||
                System.Text.RegularExpressions.Regex.IsMatch(path,"^/downloads/package/"+id+"$")||
                (System.Text.RegularExpressions.Regex.IsMatch(uri.Query,@"(?:^\?|&)download(?:[=&]|$)") &&
                (System.Text.RegularExpressions.Regex.IsMatch(path,"^/api/workflows/"+id+"/assets/[a-f0-9]{64}$")||
                System.Text.RegularExpressions.Regex.IsMatch(path,"^/images/"+id+"/(?:source|result(?:-"+id+")?)\\.(?:png|jpg|webp)$")));
            if(!permitted)return;
            await SaveLocalExport(address,message.ContainsKey("name")?Convert.ToString(message["name"]):null);
        }catch{}
    }
    async void ExportStarted(object sender,CoreWebView2DownloadStartingEventArgs e){
        var address=e.DownloadOperation.Uri;
        if(!Own(address)){e.Cancel=true;e.Handled=true;return;}
        var name=Path.GetFileName(e.ResultFilePath);
        e.Handled=true;
        e.Cancel=true;
        await SaveLocalExport(address,name);
    }
    async Task SaveLocalExport(string address,string name){
        string temp=null;
        try{
            exportText.Text="正在保存本机导出文件…";exportsBar.Visible=true;
            using(var client=new HttpClient(new HttpClientHandler{UseProxy=false,AllowAutoRedirect=false})){
                client.Timeout=TimeSpan.FromMinutes(10);
                using(var response=await client.GetAsync(address,HttpCompletionOption.ResponseHeadersRead)){
                    if(response.StatusCode!=System.Net.HttpStatusCode.OK)
                        throw new IOException("本机文件返回 "+(int)response.StatusCode+"，请从原步骤重新导出。");
                    string folder=Path.Combine(Program.Root,"data","exports");
                    Directory.CreateDirectory(folder);
                    if(!String.Equals(new DirectoryInfo(folder).FullName,folder,StringComparison.OrdinalIgnoreCase)||
                        (File.GetAttributes(folder)&FileAttributes.ReparsePoint)!=0)throw new IOException("本机导出目录不可写。");
                    if(String.IsNullOrWhiteSpace(name)){
                        var disposition=response.Content.Headers.ContentDisposition;
                        name=disposition==null?null:disposition.FileNameStar??disposition.FileName;
                        if(String.IsNullOrWhiteSpace(name))name=Path.GetFileName(new Uri(address).AbsolutePath);
                    }
                    if(String.IsNullOrWhiteSpace(name))name="导出文件";
                    name=name.Trim('"');
                    foreach(char c in Path.GetInvalidFileNameChars())name=name.Replace(c,'_');
                    name=name.Trim().TrimEnd('.');
                    if(name.Length==0)name="导出文件";
                    temp=Path.Combine(folder,Guid.NewGuid().ToString("N")+".part");
                    using(var output=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,true))
                    using(var input=await response.Content.ReadAsStreamAsync())
                        await input.CopyToAsync(output);
                    if(response.Content.Headers.ContentLength.HasValue&&response.Content.Headers.ContentLength.Value!=new FileInfo(temp).Length)
                        throw new IOException("导出文件不完整，请重新保存。");
                    IEnumerable<string> hashes;
                    if(response.Headers.TryGetValues("X-Houtu-Content-SHA256",out hashes)){
                        string actual;
                        using(var sha=SHA256.Create())using(var file=File.OpenRead(temp))
                            actual=BitConverter.ToString(sha.ComputeHash(file)).Replace("-","");
                        if(!String.Equals(actual,hashes.FirstOrDefault(),StringComparison.OrdinalIgnoreCase))
                            throw new IOException("导出文件校验失败，请重新保存。");
                    }
                    var stem=Path.GetFileNameWithoutExtension(name);var ext=Path.GetExtension(name);
                    if(stem.Length>110)stem=stem.Substring(0,110);
                    name=stem+ext;
                    for(int i=0;;i++){
                        var target=Path.Combine(folder,i==0?name:stem+" ("+i+")"+ext);
                        try{File.Move(temp,target);temp=null;exportText.Text="已保存 "+Path.GetFileName(target);break;}
                        catch(IOException){if(i>=999||!File.Exists(target))throw;}
                    }
                }
            }
        }catch(Exception error){exportText.Text="导出失败 · "+error.Message;}
        finally{if(temp!=null)try{File.Delete(temp);}catch{}}
    }
    async Task ProbeExport(string kind,string name,string script){
        string file=Path.Combine(Program.Root,"data/exports",name);
        if(File.Exists(file))throw new IOException("Smoke output already exists: "+name);
        await view.CoreWebView2.ExecuteScriptAsync(script);
        for(int i=0;i<160&&!File.Exists(file);i++)await Task.Delay(100);
        if(!File.Exists(file))throw new IOException(kind+": "+exportText.Text);
        if(new FileInfo(file).Length==0)throw new IOException(kind+" is empty");
        File.AppendAllText(Path.Combine(Program.Root,"tmp/export-smoke.txt"),kind+"=Completed"+Environment.NewLine);
    }
    async Task ProbeExports(){
        using(var request=new HttpRequestMessage(HttpMethod.Post,origin+"/api/logs/export")){
            request.Headers.Add("Origin",origin);request.Headers.Add("X-Paint-CSRF",csrf);
            request.Content=new StringContent("{}",Encoding.UTF8,"application/json");
            using(var response=await http.SendAsync(request)){
                response.EnsureSuccessStatusCode();
                var receipt=Program.Json.Deserialize<Dictionary<string,object>>(await response.Content.ReadAsStringAsync());
                await ProbeExport("logs",Convert.ToString(receipt["name"]),"(()=>{let a=document.createElement('a');a.href="+Program.Json.Serialize(receipt["downloadUrl"])+";a.download="+Program.Json.Serialize(receipt["name"])+";document.body.append(a);a.click();a.remove();})()");
            }
        }
        string name="export-probe-"+Guid.NewGuid().ToString("N")+".png";
        await ProbeExport("blob",name,"(()=>{let c=document.createElement('canvas');c.width=3;c.height=2;c.toBlob(b=>{let a=document.createElement('a');a.href=URL.createObjectURL(b);a.download="+Program.Json.Serialize(name)+";a.click();});})()");
        string photo=Path.Combine(Program.Root,"tmp","private-export-probe.jpg");
        if(File.Exists(photo)){
            var bytes=File.ReadAllBytes(photo);
            if(bytes.Length>8*1024*1024)throw new IOException("Private export fixture is too large for the desktop smoke");
            int width,height;
            using(var image=Image.FromFile(photo)){width=image.Width;height=image.Height;}
            var core=view.CoreWebView2;
            string stem="private-export-probe-"+Guid.NewGuid().ToString("N");
            string input="(()=>{let a=Uint8Array.from(atob("+Program.Json.Serialize(Convert.ToBase64String(bytes))+"),c=>c.charCodeAt(0));let d=new DataTransfer();d.items.add(new File([a],"+Program.Json.Serialize(stem+".jpg")+",{type:'image/jpeg'}));let f=document.querySelector('#file');f.files=d.files;f.dispatchEvent(new Event('change',{bubbles:true}));})()";
            await core.ExecuteScriptAsync(input);
            await WaitExportUi("!!document.querySelector('#docName')&&document.querySelector('#docName').textContent==="+Program.Json.Serialize(stem+".jpg")+"&&!document.querySelector('#export').disabled");
            foreach(string ext in new[]{"png","jpg"}){
                await core.ExecuteScriptAsync("document.querySelector('#export').click()");
                await WaitExportUi("!!document.querySelector('#doExport')");
                string file=stem+"-成片."+ext;
                string mime=ext=="png"?"image/png":"image/jpeg";
                await ProbeExport("sample-"+ext,file,"(()=>{document.querySelector('#exportFormat').value='"+mime+"';document.querySelector('#doExport').click();})()");
                using(var image=Image.FromFile(Path.Combine(Program.Root,"data/exports",file))){
                    if(image.Width!=width||image.Height!=height)throw new IOException("Private image dimensions changed");
                    var kind=ext=="png"?System.Drawing.Imaging.ImageFormat.Png:System.Drawing.Imaging.ImageFormat.Jpeg;
                    if(!image.RawFormat.Equals(kind))throw new IOException("Private image format changed");
                }
            }
        }
    }
    async Task WaitExportUi(string expression){
        for(int i=0;i<150;i++){
            if(await view.CoreWebView2.ExecuteScriptAsync(expression)=="true")return;
            await Task.Delay(100);
        }
        throw new IOException("Desktop export controls did not become ready");
    }
    async Task Smoke(){
        if(exiting)return;
        exiting=true;
        string failure=null;
        try{
            string raw=await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({url:location.href,file:!!document.querySelector('#file')&&!!document.querySelector('#stage')&&!!document.querySelector('[data-section=ai]')})");
            var result=Program.Json.Deserialize<Dictionary<string,object>>(Program.Json.Deserialize<string>(raw));
            if(!Own(Convert.ToString(result["url"]))||!Convert.ToBoolean(result["file"]))throw new IOException("Workbench DOM missing");
            using(var file=File.Create(Path.Combine(Program.Root,"tmp/desktop-smoke.png")))
                await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,file);
            await ProbeExports();
        }catch(Exception error){failure=error.Message;}
        if(ownedServer)try{await StopServer();}catch{}
        if(failure!=null){Failure(failure);return;}
        Program.Write(Path.Combine(Program.Root,"tmp/desktop-smoke.json"),new{downloadsVerified=true,result="PASS",nativeWindow=true,webview2=true,localServer=true,profile=Path.Combine(Program.Root,"data/desktop-webview"),aiGenerations=0});
        allowClose=true;
        Close();
    }
    void Failure(string error){Program.Write(Path.Combine(Program.Root,"tmp/desktop-smoke.json"),new{result="FAIL",error=error});allowClose=true;Close();}
}
