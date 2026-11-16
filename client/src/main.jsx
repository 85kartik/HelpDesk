import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, NavLink, Link, Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LifeBuoy, LayoutDashboard, Ticket, Users, UserRound, ChartColumn, Plus, ArrowUpRight, LogOut, Menu, Paperclip, Search, Clock3, CircleCheck, CircleDot, Eye, EyeOff } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider, useAuth } from './Auth';
import { api, get, errorMessage } from './services/api';
import './style.css';

const statuses = ['open','in-progress','resolved'];
const priorities = ['low','medium','high'];
const categories = ['technical','billing','general'];
const titles = { customer:'Customer', agent:'Support agent', admin:'Administrator' };
const listPaths = { customer:'/tickets/my', agent:'/tickets/assigned', admin:'/tickets' };
const listTitles = { customer:'My tickets', agent:'Assigned tickets', admin:'All tickets' };
const label = value => String(value).replaceAll('-',' ').replace(/^./,letter => letter.toUpperCase());
const date = value => new Date(value).toLocaleDateString(undefined,{ month:'short', day:'numeric', year:'numeric' });
const formValues = event => Object.fromEntries(new FormData(event.currentTarget));
function useData(path) {
  const [state,setState] = useState({ loading:true });
  const [version,refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading:true });
    get(path,{ signal:controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ data });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ error:errorMessage(error) });
    });
    return () => controller.abort();
  },[path,version]);
  return { ...state, reload:() => refresh(n => n+1) };
}
function Present({ state, children }) {
  if (state.loading) return <div className="panel notice" role="status">Loading…</div>;
  if (state.error) return <div className="panel notice" role="alert">{state.error} <button onClick={state.reload}>Retry</button></div>;
  return children(state.data);
}
function Header({ title, description, children }) {
  return <div className="page-head"><div><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
function Brand() { return <div className="brand"><span><LifeBuoy size={21}/></span>HelpDesk</div>; }
function PasswordField({ label, name, hint, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const ToggleIcon = visible ? EyeOff : Eye;
  const hintId = hint ? name + '-hint' : undefined;
  return <div className="password-field">
    <label htmlFor={name}>{label}</label>
    <div className="password-input">
      <input id={name} name={name} type={visible ? 'text' : 'password'} aria-describedby={hintId} {...inputProps}/>
      <button type="button" aria-label={(visible ? 'Hide ' : 'Show ') + label.toLowerCase()} onClick={() => setVisible(value => !value)}>
        <ToggleIcon size={19} aria-hidden="true"/>
      </button>
    </div>
    {hint && <small id={hintId}>{hint}</small>}
  </div>;
}
function AuthPage({ mode }) {
  const { user,login } = useAuth();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const register = mode === 'register';
  const [accountType,setAccountType] = useState('customer');
  if (user) return <Navigate to="/" replace/>;
  async function submit(event) {
    event.preventDefault();
    const values = formValues(event);
    setBusy(true);
    setError('');
    try { await login(mode,values); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <main className="auth"><section className="auth-story"><Brand/><div><LifeBuoy size={82} strokeWidth={1}/><h1>Support starts here.</h1><p>Open tickets, follow updates, and keep every conversation in one place.</p></div></section><section className="auth-form"><form className="stack" onSubmit={submit}><h1>{register ? 'Create your account' : 'Welcome back'}</h1><p>{register ? 'Register to open and track support tickets.' : 'Sign in to your support workspace.'}</p>{register && <label>Name<input name="name" maxLength={100} autoComplete="name" required/></label>}{register && <label>Account type<select name="accountType" value={accountType} onChange={event => setAccountType(event.target.value)}><option value="customer">Customer</option><option value="admin">Administrator</option></select></label>}{register && accountType === 'admin' && <label>Administrator setup code<input name="setupCode" type="password" autoComplete="off" required/></label>}<label>Email address<input type="email" name="email" autoComplete="email" required/></label><PasswordField label="Password" name="password" minLength={register ? 12 : undefined} maxLength={72} autoComplete={register ? 'new-password' : 'current-password'} required/>{!register && <Link to="/forgot-password">Forgot password?</Link>}{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button><p>{register ? 'Already registered?' : 'New to HelpDesk?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p></form></section></main>;
}
function PasswordRecovery() {
  const [email,setEmail] = useState('');
  const [sent,setSent] = useState(false);
  const [busy,setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event) {
    event.preventDefault();
    const values = formValues(event);
    setBusy(true);
    try {
      if (sent) {
        await api.post('/auth/reset-password',{...values,email});
        toast.success('Password reset. Sign in with your new password.');
        navigate('/login');
      } else {
        await api.post('/auth/forgot-password',{email});
        setSent(true);
      }
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <main className="auth-form"><form key={sent} className="panel padded stack" onSubmit={submit}>
    <h1>Reset password</h1>
    <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} required readOnly={sent}/></label>
    {sent && <><p>Verification code sent. It expires in 10 minutes.</p><label>Six-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required/></label><NewPassword/></>}
    <button className="primary" disabled={busy}>{sent ? 'Reset password' : 'Send code'}</button>
    {sent && <button type="button" disabled={busy} onClick={() => setSent(false)}>Change email or request another code</button>}
    <Link to="/login">Back to sign in</Link>
  </form></main>;
}
function NewPassword() {
  return <PasswordField label="New password" name="newPassword" autoComplete="new-password" minLength={12} maxLength={72} hint="Use at least 12 characters." required/>;
}
function ChangePassword() {
  const { logout } = useAuth();
  const [busy,setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const values = formValues(event);
    setBusy(true);
    try { await api.post('/auth/change-password',values); logout(); toast.success('Password changed. Sign in again.'); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <form className="panel padded stack form-width" onSubmit={submit}><h2>Change password</h2><PasswordField label="Current password" name="currentPassword" autoComplete="current-password" required/><NewPassword/><button className="primary" disabled={busy}>Change password</button></form>;
}
function Shell() {
  const { user,logout } = useAuth();
  const [open,setOpen] = useState(false);
  if (!user) return <Navigate to="/login" replace/>;
  const links = [['/','Overview',LayoutDashboard],['/tickets',listTitles[user.role],Ticket],['/profile','Profile',UserRound]];
  if (user.role === 'admin') links.splice(2,0,['/users','Manage users',Users],['/agents','Manage agents',Users],['/analytics','Analytics',ChartColumn]);
  return <div className="shell"><a className="skip-link" href="#workspace-content">Skip to content</a>{open && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>}<aside id="workspace-sidebar" className={open ? 'sidebar open' : 'sidebar'}><Brand/><nav aria-label="Workspace">{links.map(([url,title,Icon]) => <NavLink end to={url} key={url} onClick={() => setOpen(false)}><Icon size={18}/>{title}</NavLink>)}</nav><button className="logout" onClick={logout}><LogOut size={17}/> Sign out</button></aside><div className="workspace"><header className="top"><button className="menu" type="button" aria-label="Toggle navigation" aria-controls="workspace-sidebar" aria-expanded={open} onClick={() => setOpen(!open)}><Menu size={20}/></button><span>Support workspace</span><Link to="/profile" className="identity"><span className="avatar">{user.name.slice(0,1).toUpperCase()}</span><span>{user.name}<small>{titles[user.role]}</small></span></Link></header><main className="content" id="workspace-content" tabIndex={-1}><Outlet/></main></div></div>;
}
function Badge({ value }) { return <span className={'badge '+value}>{label(value)}</span>; }
function TicketTable({ items }) {
  if (!items.length) return <div className="notice">No tickets to show.</div>;
  return <div className="table-wrap ticket-table"><table><thead><tr><th>Ticket</th><th>Status</th><th>Priority</th><th>Created</th><th><span className="sr-only">Open ticket</span></th></tr></thead><tbody>{items.map(ticket => <tr key={ticket._id}><td><Link className="ticket-title" to={'/tickets/'+ticket._id}>{ticket.title}</Link><small>{label(ticket.category)}</small></td><td className="ticket-status"><Badge value={ticket.status}/></td><td className="ticket-priority"><Badge value={ticket.priority}/></td><td className="ticket-date">{date(ticket.createdAt)}</td><td><Link aria-label={'Open '+ticket.title} to={'/tickets/'+ticket._id}><ArrowUpRight size={16}/></Link></td></tr>)}</tbody></table></div>;
}
function Charts({ data }) {
  return <div className="charts">{[['status',statuses],['priority',priorities],['category',categories]].map(([group,values]) => <section className="panel chart" key={group}><h2>Tickets by {group}</h2><ResponsiveContainer width="100%" height={190}><BarChart data={values.map(value => ({ name:label(value), count:data[group].find(row => row._id === value)?.count || 0 }))}><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12}/><YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false}/><Tooltip/><Bar name="Tickets" dataKey="count" fill="#5850d8" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></section>)}</div>;
}
function Dashboard({ analytics = false }) {
  const { user } = useAuth();
  const stats = useData('/dashboard/stats');
  return <><Header title={analytics ? 'Support analytics' : 'Dashboard'} description={analytics ? 'Track ticket volume across your support operation.' : 'Welcome back, ' + user.name.split(' ')[0] + '.'}>{user.role === 'customer' && <Link className="primary" to="/tickets/new"><Plus size={17}/> New ticket</Link>}</Header><Present state={stats}>{data => <>
    <div className="stats">{[['Total tickets',data.total,Ticket],...statuses.map((status,index) => [label(status),data.status.find(x => x._id === status)?.count || 0,[CircleDot,Clock3,CircleCheck][index]]),...(user.role === 'admin' ? [['Customers',data.customers,Users],['Agents',data.agents,UserRound]] : [])].map(([name,value,Icon]) => <section className="panel stat" key={name}><span><Icon size={19}/></span><p>{name}</p><strong>{value}</strong></section>)}</div>
    {user.role === 'admin' && <Charts data={data}/>}<section className="panel"><div className="section-head"><h2>Recent tickets</h2><Link to="/tickets">View all</Link></div><TicketTable items={data.recent}/></section>
    {user.role === 'admin' && <section className="panel padded"><h2>Recent activity</h2>{data.activity.length ? <ul>{data.activity.map(item => <li key={item._id}>{label(item.action)} · {item.ticket?.title || 'Deleted ticket'} · {date(item.createdAt)}</li>)}</ul> : <p>No ticket activity yet.</p>}</section>}
  </>}</Present></>;
}
function Select({ name, values, empty, value, onChange }) {
  return <select name={name} value={value} defaultValue={value === undefined ? '' : undefined} onChange={onChange} required={!empty}>{empty ? <option value="">{empty}</option> : <option value="" disabled>Choose {name}</option>}{values.map(item => <option key={item} value={item}>{label(item)}</option>)}</select>;
}
function Pagination({ data, change }) {
  return <div className="pagination"><button disabled={data.page===1} onClick={() => change(data.page-1)}>Previous</button><span>Page {data.page} · {data.total} results</span><button disabled={data.page*data.limit>=data.total} onClick={() => change(data.page+1)}>Next</button></div>;
}
function AdminQueueTabs({ params, setParams }) {
  const stats = useData('/admin/stats');
  const current = params.get('status') || '';
  const tabs = [['','All tickets'],['pending','Pending'],['open','Open'],['in-progress','In progress'],['resolved','Done']];
  function count(status) {
    if (!stats.data) return '';
    if (!status) return stats.data.total;
    return stats.data.status.filter(row => status === 'pending' ? row._id !== 'resolved' : row._id === status).reduce((sum,row) => sum + row.count,0);
  }
  return <nav className="panel queue-tabs" aria-label="Ticket status">{tabs.map(([status,title]) => <button key={status} type="button" aria-pressed={current === status} onClick={() => {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (status) next.set('status',status); else next.delete('status');
    setParams(next);
  }}>{title}{stats.data && <small>{count(status)}</small>}</button>)}</nav>;
}
function TicketList() {
  const { user } = useAuth();
  const [params,setParams] = useSearchParams();
  const data = useData(listPaths[user.role]+'?'+params);
  function filter(event) {
    event.preventDefault();
    const values = formValues(event);
    setParams(Object.entries(values).filter(([,value]) => value));
  }
  return <><Header title={listTitles[user.role]} description="Search and filter your support queue.">{user.role === 'customer' && <Link className="primary" to="/tickets/new"><Plus size={17}/> New ticket</Link>}</Header>{user.role === "admin" && <AdminQueueTabs params={params} setParams={setParams}/>}<form className="panel filters" onSubmit={filter} key={params.toString().replace(/&?page=\d+/,'')}><label>Search<input name="q" type="search" placeholder="Find a ticket" defaultValue={params.get('q') || ''}/></label>{Object.entries({status:user.role === 'admin' ? ['pending',...statuses] : statuses,priority:priorities,category:categories,sort:['newest','oldest']}).map(([name,values]) => <label key={name}>{label(name)}<select name={name} defaultValue={params.get(name) || ''}><option value="">{name==='sort' ? 'Newest first' : 'Any '+name}</option>{values.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>)}<button><Search size={16}/> Apply</button></form><Present state={data}>{result => <section className="panel"><TicketTable items={result.items}/><Pagination data={result} change={page => { const next=new URLSearchParams(params); next.set('page',page); setParams(next); }}/></section>}</Present></>;
}
function Upload() { return <label><span><Paperclip size={15}/> Attachments</span><input type="file" name="attachments" multiple accept="image/png,image/jpeg,application/pdf"/><small>Up to 3 PNG, JPEG, or PDF files, 4 MB each.</small></label>; }
function multipart(event) {
  const body = new FormData(event.currentTarget);
  const files = body.getAll('attachments').filter(file => file.size);
  body.delete('attachments');
  for (const file of files) body.append('attachments',file);
  return body;
}
function TicketCreate() {
  const navigate = useNavigate();
  const [busy,setBusy]=useState(false);
  async function submit(event) {
    event.preventDefault();
    const body=multipart(event);
    setBusy(true);
    try { const result=await api.post('/tickets',body); toast.success('Ticket created'); navigate('/tickets/'+result.data.data._id); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <><Header title="New ticket" description="Tell the support team how they can help."/><form className="panel padded stack form-width" onSubmit={submit}><label>Title<input name="title" required maxLength={150}/></label><label>Category<Select name="category" values={categories}/></label><label>Description<textarea name="description" required maxLength={6000} rows={6}/></label><Upload/><button className="primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit ticket'}</button></form></>;
}
async function download(path,name) {
  try {
    const response=await api.get(path,{ responseType:'blob' });
    const url=URL.createObjectURL(response.data);
    const link=document.createElement('a');
    link.href=url;
    link.download=name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  } catch { toast.error('Attachment could not be downloaded'); }
}
function Files({ files, path }) {
  return files?.length > 0 && <div className="file-list">{files.map(file => <button key={file._id} onClick={() => download(path+'/'+file._id,file.name.slice(37))}><Paperclip size={15}/>{file.name.slice(37)}</button>)}</div>;
}
function AgentPicker({ ticket, update, busy }) {
  const [page,setPage]=useState(1);
  const agents=useData('/admin/agents?page='+page+'&limit=25');
  return <Present state={agents}>{data => <><label>Assigned agent<select disabled={busy} value={ticket.assignedTo?._id || ''} onChange={event => update('assign',{agentId:event.target.value || null})}><option value="">Unassigned</option>{ticket.assignedTo && !data.items.some(agent => agent._id===ticket.assignedTo._id) && <option value={ticket.assignedTo._id}>{ticket.assignedTo.name}</option>}{data.items.map(agent => <option value={agent._id} key={agent._id}>{agent.name}</option>)}</select></label>{data.total>data.limit && <Pagination data={data} change={setPage}/>}</>}</Present>;
}
function TicketDetails() {
  const { id }=useParams();
  const { user }=useAuth();
  const path='/tickets/'+id;
  const detail=useData(path);
  const [page,setPage]=useState(1);
  const comments=useData(path+'/comments?page='+page);
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const navigate=useNavigate();
  async function act(operation,after,message) {
    setBusy(true);
    try { await operation(); after(); toast.success(message); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }
  function reply(event) {
    event.preventDefault();
    const form=event.currentTarget;
    const body=multipart(event);
    act(() => api.post(path+'/comments',body),() => { form.reset(); setPage(1); comments.reload(); },'Reply sent');
  }
  const update=(field,body)=>act(() => api.patch(path+'/'+field,body),detail.reload,'Ticket updated');
  return <><Link className="back" to="/tickets">← Back to tickets</Link><Present state={detail}>{({ticket,history}) => <><Header title={ticket.title} description={label(ticket.category)+' · Opened '+date(ticket.createdAt)}/><div className="detail-grid"><div className="stack"><section className="panel padded"><h2>Description</h2><p className="preserve">{ticket.description}</p><Files files={ticket.attachments} path={path+'/attachments'}/></section><section className="panel padded stack"><h2>Conversation</h2><Present state={comments}>{data => <>{data.items.length ? data.items.map(comment => <article className="comment" key={comment._id}><strong>{comment.user?.name || 'Former user'}</strong><small>{date(comment.createdAt)}</small><p className="preserve">{comment.message}</p><Files files={comment.attachments} path={path+'/comments/'+comment._id+'/attachments'}/></article>) : <p>No replies yet.</p>}<Pagination data={data} change={setPage}/></>}</Present><form className="stack" onSubmit={reply}><label>Reply<textarea name="message" maxLength={4000} required rows={3}/></label><Upload/><button className="primary" disabled={busy}>Send reply</button></form></section></div><div className="stack"><section className="panel padded stack"><h2>Ticket details</h2><div><Badge value={ticket.status}/> <Badge value={ticket.priority}/></div><p>{ticket.assignedTo?.name || 'Unassigned'}</p>{user.role!=='customer' && <label>Status<Select name="status" values={statuses} value={ticket.status} onChange={event => !busy && update('status',{status:event.target.value})}/></label>}{user.role==='admin' && <><label>Priority<Select name="priority" values={priorities} value={ticket.priority} onChange={event => !busy && update('priority',{priority:event.target.value})}/></label><AgentPicker ticket={ticket} update={update} busy={busy}/><button className="danger" disabled={busy} onClick={() => setConfirm(true)}>Delete ticket</button></>}</section><section className="panel padded"><h2>Activity</h2><ul className="timeline">{history.map(item => <li key={item._id}><strong>{label(item.action)}{item.action==='status' || item.action==='priority' ? ' · '+label(item.newValue) : ''}</strong><small>{item.performedBy?.name || 'Former user'} · {date(item.createdAt)}</small></li>)}</ul></section></div></div></>}</Present>{confirm && <div className="overlay"><section className="panel padded stack" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete this ticket?</h2><p>The conversation and attachments will be removed.</p><div className="actions"><button autoFocus onClick={() => setConfirm(false)}>Cancel</button><button className="danger" disabled={busy} onClick={() => act(() => api.delete(path),() => navigate('/tickets'),'Ticket deleted')}>Delete</button></div></section></div>}</>;
}
function Directory({ agents }) {
  const [page,setPage]=useState(1);
  const [busy,setBusy]=useState(false);
  const data=useData('/admin/'+(agents?'agents':'users')+'?page='+page);
  async function promote(id) {
    setBusy(true);
    try { await api.patch('/admin/users/'+id+'/role',{ role:'agent' }); toast.success('Support agent added'); data.reload(); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <><Header title={agents?'Manage agents':'Manage users'} description={agents?'View active support agents.':'Review accounts and promote customers to support agents.'}/><Present state={data}>{result => <section className="panel"><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead><tbody>{result.items.map(user => <tr key={user._id}><td>{user.name}</td><td>{user.email}</td><td>{titles[user.role]}</td><td>{user.role==='customer' && user.isActive && <button disabled={busy} onClick={() => { if (window.confirm('Promote '+user.name+' to support agent?')) promote(user._id); }}>Promote to agent</button>}</td></tr>)}</tbody></table></div>{!result.items.length && <div className="notice">No accounts to show.</div>}<Pagination data={result} change={setPage}/></section>}</Present></>;
}
function Profile() {
  const data=useData('/auth/profile');
  return <><Header title="Profile" description="Your name, email, and workspace access."/><Present state={data}>{user => <section className="panel padded form-width"><dl><dt>Name</dt><dd>{user.name}</dd><dt>Email</dt><dd>{user.email}</dd><dt>Role</dt><dd>{titles[user.role]}</dd></dl></section>}</Present><ChangePassword/></>;
}
function Gate({ role, children }) { return useAuth().user?.role===role ? children : <Navigate to="/" replace/>; }
function App() {
  return <BrowserRouter><AuthProvider><Routes><Route path="/login" element={<AuthPage key="login" mode="login"/>}/><Route path="/forgot-password" element={<PasswordRecovery/>}/><Route path="/register" element={<AuthPage key="register" mode="register"/>}/><Route element={<Shell/>}><Route index element={<Dashboard/>}/><Route path="tickets" element={<TicketList/>}/><Route path="tickets/new" element={<Gate role="customer"><TicketCreate/></Gate>}/><Route path="tickets/:id" element={<TicketDetails/>}/><Route path="users" element={<Gate role="admin"><Directory key="users"/></Gate>}/><Route path="agents" element={<Gate role="admin"><Directory key="agents" agents/></Gate>}/><Route path="analytics" element={<Gate role="admin"><Dashboard analytics/></Gate>}/><Route path="profile" element={<Profile/>}/></Route><Route path="*" element={<main className="auth-form"><section className="panel padded stack"><Brand/><h1>Page not found</h1><Link className="primary" to="/">Back to HelpDesk</Link></section></main>}/></Routes><ToastContainer position="bottom-right" theme="light"/></AuthProvider></BrowserRouter>;
}
createRoot(document.getElementById('root')).render(<App/>);
