import React, { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
  MapPin, UsersRound, Settings2, Bell, ShieldCheck, Radio, LocateFixed,
  Plus, ArrowRight, LogOut, Copy, Check, Menu, X, Heart, Navigation,
  ChevronRight, Clock3, UserRoundPlus, MapPinned, Eye, EyeOff, RefreshCw,
  Smartphone, LockKeyhole, CircleHelp, Wifi, WifiOff, Shield, KeyRound,
  AlertCircle, Sparkles, ExternalLink, RadioTower, UserRound, Mail
} from 'lucide-react'
import { supabase, isConfigured } from './supabase.js'

const DEMO_FAMILY = { id: 'demo', name: 'The Rivera Family', owner_id: 'demo-parent' }
const DEMO_MEMBERS = [
  { user_id: 'demo-child-1', relation: 'daughter', profiles: { full_name: 'Maya Rivera' }, preview: true },
  { user_id: 'demo-child-2', relation: 'son', profiles: { full_name: 'Noah Rivera' }, preview: true }
]
const DEMO_LOCATIONS = [
  { user_id: 'demo-child-1', latitude: 11.00545, longitude: 124.6078, accuracy_m: 22, updated_at: new Date().toISOString(), enabled: true },
  { user_id: 'demo-child-2', latitude: 11.0009, longitude: 124.6144, accuracy_m: 35, updated_at: new Date().toISOString(), enabled: true }
]
const initials = name => (name || 'FM').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const timeAgo = timestamp => {
  if (!timestamp) return 'No location yet'
  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime())
  if (elapsed < 60_000) return 'Just now'
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} min ago`
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} hr ago`
  return `${Math.floor(elapsed / 86400000)} days ago`
}
const stateFor = loc => {
  if (!loc?.enabled || loc.latitude == null || loc.longitude == null || !Number.isFinite(Number(loc.latitude))) return 'paused'
  const ms = Date.now() - new Date(loc.updated_at).getTime()
  if (ms < 30000) return 'live'
  if (ms < 120000) return 'recent'
  return 'stale'
}
const sanitize = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const IconButton = ({ children, onClick, className = '', title }) => <button className={`icon-button ${className}`} title={title} aria-label={title} onClick={onClick}>{children}</button>
const Avatar = ({ name, type = 'parent', size = '' }) => <span className={`avatar ${type} ${size}`}>{initials(name)}</span>
const Status = ({ state, sample = false }) => <span className={`status-pill ${sample ? 'sample' : state}`}><span className="status-dot" />{sample ? 'SAMPLE' : state === 'live' ? 'Live now' : state === 'recent' ? 'Recently seen' : state === 'stale' ? 'Last known' : 'Not sharing'}</span>

function FamilyMap({ members, locations, preview = false, selectedId, onSelect, className = '' }) {
  const elementRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(null)
  const firstFitRef = useRef(true)
  const points = members.map((m, idx) => ({ member: m, idx, loc: locations.find(l => l.user_id === m.user_id) })).filter(o => o.loc && o.loc.latitude != null && o.loc.longitude != null && Number.isFinite(Number(o.loc.latitude)) && Number.isFinite(Number(o.loc.longitude)) && o.loc.enabled)
  useEffect(() => {
    if (!elementRef.current || mapRef.current) return
    const map = L.map(elementRef.current, { zoomControl: false, attributionControl: true }).setView([12.8797, 121.774], 5)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map
    markersRef.current = L.layerGroup().addTo(map)
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(elementRef.current)
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; markersRef.current = null; firstFitRef.current = true }
  }, [])
  useEffect(() => {
    const map = mapRef.current
    const layer = markersRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const bounds = []
    for (const { member, idx, loc } of points) {
      const latlng = [Number(loc.latitude), Number(loc.longitude)]
      const name = member.profiles?.full_name || 'Family member'
      const status = stateFor(loc)
      const hue = idx % 2 ? 'orange' : 'cyan'
      const icon = L.divIcon({
        className: 'family-pin-wrap',
        html: `<div class="family-map-pin ${hue} ${status}"><span>${sanitize(initials(name))}</span><i></i></div>`,
        iconSize: [58, 68], iconAnchor: [29, 60], popupAnchor: [0, -56]
      })
      const marker = L.marker(latlng, { icon }).addTo(layer)
      marker.bindPopup(`<div class="map-popup"><b>${sanitize(name)}</b><small>${preview ? 'Preview location — not live' : sanitize(member.relation || 'Member')} · ${sanitize(timeAgo(loc.updated_at))}</small><small>Accuracy: approximately ${Math.round(loc.accuracy_m || 0)} m</small></div>`)
      marker.on('click', () => onSelect?.(member.user_id))
      if (selectedId === member.user_id) marker.openPopup()
      if (loc.accuracy_m && loc.accuracy_m < 10000) L.circle(latlng, { radius: Number(loc.accuracy_m), color: hue === 'cyan' ? '#00cdea' : '#ff9a4c', fillOpacity: .065, weight: 1 }).addTo(layer)
      bounds.push(latlng)
    }
    if (bounds.length && firstFitRef.current) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [65, 65], maxZoom: 15 })
      firstFitRef.current = false
    }
  }, [members, locations, selectedId, preview])
  function locateAll() {
    if (!mapRef.current || !points.length) return
    const bounds = L.latLngBounds(points.map(x => [Number(x.loc.latitude), Number(x.loc.longitude)]))
    mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 })
  }
  return <div className={`family-map ${className}`}>
    <div className="leaflet-map" ref={elementRef} />
    <div className="map-top-label"><span className="map-light" /><div><b>Family live map</b><small>{preview ? 'Interface preview · sample coordinates' : 'Private to linked family accounts'}</small></div></div>
    {points.length ? <button className="map-recenter" onClick={locateAll}><LocateFixed size={17} /> Fit family</button> : <div className="no-map-points"><MapPin size={25} /><b>No shared locations</b><span>Locations appear after a child opts in and opens sharing.</span></div>}
    <span className="map-osm-label">Map © OpenStreetMap</span>
  </div>
}

function AuthScreen({ onPreview }) {
  const [tab, setTab] = useState('signup')
  const [role, setRole] = useState('parent')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setError(''); setNotice('')
    if (!isConfigured) { setError('Connect your own Supabase project to enable account registration. You can preview the app now.'); return }
    if (tab === 'signup' && role === 'child' && invite.trim().length < 6) { setError('Ask your parent for your family invitation code.'); return }
    setBusy(true)
    try {
      if (tab === 'signup') {
        if (role === 'child') sessionStorage.setItem('werfam_pending_invite', invite.trim().toUpperCase())
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim(), role } } })
        if (authError) throw authError
        if (!data.session) setNotice('Check your email to confirm your account, then sign in. Child accounts can apply their family code after signing in.')
        else setNotice('Account created. Welcome to weRfam!')
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
      }
    } catch (err) { setError(err.message || 'Could not sign in.') } finally { setBusy(false) }
  }
  return <div className="auth-layout">
    <section className="auth-hero">
      <header className="auth-brand"><img src="/logo-wordmark.webp" alt="weRfam" /><span>FAMILY LOCATION SHARING</span></header>
      <div className="auth-hero-content"><span className="eyebrow light"><span className="eyebrow-dot" /> Stay close, even when apart</span>
        <h1>Your family.<br /><em>Your peace of mind.</em></h1>
        <p>A beautifully simple, private space to stay connected with your loved ones — wherever the day takes them.</p>
        <div className="hero-chips"><span><ShieldCheck size={16} /> Private family circle</span><span><Radio size={16} /> Live when sharing</span></div>
      </div>
      <div className="hero-emblem"><img src="/logo-emblem.webp" alt="weRfam map emblem" /></div>
      <div className="auth-hero-bottom"><span>MADE FOR THE PEOPLE WHO MATTER MOST</span><Heart fill="currentColor" size={15} /></div>
    </section>
    <section className="auth-side"><div className="auth-mobile-logo"><img src="/logo-wordmark.webp" alt="weRfam" /></div>
      <div className="auth-card"><div className="auth-icon"><UsersRound size={25} /></div><h2>{tab === 'signup' ? 'Welcome to the family' : 'Welcome back!'}</h2><p>{tab === 'signup' ? 'Create your secure weRfam account.' : 'Sign in to see your family circle.'}</p>
        <div className="auth-tabs"><button className={tab === 'signup' ? 'active' : ''} onClick={() => {setTab('signup');setError('');setNotice('')}}>Create account</button><button className={tab === 'login' ? 'active' : ''} onClick={() => {setTab('login');setError('');setNotice('')}}>Sign in</button></div>
        <form className="auth-form" onSubmit={submit}>
          {tab === 'signup' && <><label>Who's joining?</label><div className="role-choice"><button className={role === 'parent' ? 'chosen' : ''} type="button" onClick={() => setRole('parent')}><ShieldCheck size={18} /><b>I'm a parent</b></button><button className={role === 'child' ? 'chosen' : ''} type="button" onClick={() => setRole('child')}><Heart size={18} /><b>I'm a child</b></button></div><label htmlFor="name">Full name</label><input id="name" required maxLength={80} placeholder="Enter your full name" value={fullName} onChange={e => setFullName(e.target.value)} />{role === 'child' && <><label htmlFor="invite">Family invite code</label><input id="invite" required placeholder="12-character code" maxLength={12} value={invite} onChange={e => setInvite(e.target.value.toUpperCase())} autoCapitalize="characters" /></>}</>}
          <label htmlFor="email">Email address</label><input id="email" type="email" required placeholder="you@example.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          <label htmlFor="pass">Password</label><input id="pass" type="password" required minLength={8} placeholder="At least 8 characters" autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />
          {error && <div className="error-box"><AlertCircle size={15} /> {error}</div>}{notice && <div className="notice-box"><Check size={15} /> {notice}</div>}
          <button className="primary-btn full" disabled={busy}>{busy ? 'Please wait...' : tab === 'signup' ? 'Create my account' : 'Sign in to weRfam'} <ArrowRight size={18} /></button>
        </form>
        <div className="privacy-footer"><LockKeyhole size={15} /> Child location sharing requires device permission and can be stopped.</div>
      </div><button className="preview-link" onClick={onPreview}><Eye size={17} /> Explore the interface preview <ChevronRight size={16} /></button>
      {!isConfigured && <div className="config-callout"><Sparkles size={17}/><span><b>UI preview mode.</b> Add your Supabase credentials and run the included SQL migration to activate private accounts and GPS updates.</span></div>}
    </section>
  </div>
}

function SetupFamily({ profile, onComplete, onSignOut }) {
  const [name, setName] = useState(`${(profile?.full_name || 'Our').split(' ')[0]}'s Family`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function create(e) { e.preventDefault(); setBusy(true);setError(''); try { const { error } = await supabase.rpc('create_family', { p_name: name.trim() }); if (error) throw error; await onComplete() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <div className="setup-view"><img src="/logo-emblem.webp" alt=""/><div className="setup-card"><span className="eyebrow">ONE LAST STEP</span><h1>Let's create your family circle.</h1><p>Only your invited children will be linked to this private space.</p><form onSubmit={create}><label>Family circle name</label><input required maxLength="55" value={name} onChange={e => setName(e.target.value)} />{error && <div className="error-box">{error}</div>}<button disabled={busy} className="primary-btn full">{busy ? 'Creating...' : 'Create family circle'} <ArrowRight size={18}/></button></form><button className="text-link" onClick={onSignOut}>Sign out</button></div></div>
}

function ChildOnboarding({ onRedeem, onSignOut, name }) {
  const [code, setCode] = useState(sessionStorage.getItem('werfam_pending_invite') || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {e.preventDefault(); setBusy(true);setError('');try { await onRedeem(code.trim().toUpperCase());sessionStorage.removeItem('werfam_pending_invite') } catch (err) {setError(err.message || 'Could not join your family.')}finally{setBusy(false)}}
  return <div className="setup-view"><img src="/logo-emblem.webp" alt=""/><div className="setup-card"><span className="eyebrow">FAMILY INVITATION</span><h1>Hi {name?.split(' ')[0] || 'there'}! Join your family.</h1><p>Enter the private code your parent created for you. Your location stays off until you start sharing.</p><form onSubmit={submit}><label>Invitation code</label><input required maxLength={12} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="E.g. A1B2C3D4E5F6" autoCapitalize="characters"/>{error && <div className="error-box">{error}</div>}<button disabled={busy} className="primary-btn full">{busy ? 'Checking...' : 'Join my family'} <ArrowRight size={18}/></button></form><button className="text-link" onClick={onSignOut}>Sign out</button></div></div>
}

function AppShell({ isDemo = false, session, profile, family, members, locations, invites, onAddChild, onRedeem, onSignOut, onReload, isSharing, onStartSharing, onStopSharing, gpsNotice, busy }) {
  const [view, setView] = useState('map')
  const [showInvite, setShowInvite] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [copied, setCopied] = useState(null)
  const [message, setMessage] = useState('')
  const [childName, setChildName] = useState('')
  const [relation, setRelation] = useState('daughter')
  const [savingInvite, setSavingInvite] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const isParent = isDemo || profile?.role === 'parent'
  const effectiveMembers = isDemo ? DEMO_MEMBERS : members
  const effectiveLocations = isDemo ? DEMO_LOCATIONS : locations
  const mainName = isDemo ? 'Alex Rivera' : profile?.full_name || 'Family member'
  const familyName = isDemo ? DEMO_FAMILY.name : family?.name || 'My Family'
  const active = effectiveMembers.filter(m => stateFor(effectiveLocations.find(l => l.user_id === m.user_id)) === 'live').length
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer) }, [])
  useEffect(() => { setSelectedId(null) }, [view])
  async function addChild(e) {
    e.preventDefault()
    if (isDemo) { setMessage('Preview only: connect Supabase to create private family invitations.'); setShowInvite(false); return }
    setSavingInvite(true)
    try { await onAddChild(childName.trim(), relation); setChildName('');setShowInvite(false);setMessage('Invitation created! Copy the code and share it privately with your child.') }
    catch (err) { setMessage(err.message) }
    finally { setSavingInvite(false) }
  }
  async function copyCode(code) { try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 2000) } catch { setMessage('Clipboard unavailable. Select and copy the code manually.') } }
  const nav = [ { id:'map', label: 'Live Map', Icon: MapPinned }, { id:'family', label: 'My Family', Icon: UsersRound }, { id:'settings', label: 'Settings', Icon: Settings2 } ]
  return <div className="shell">
    <aside className="sidebar"><img className="sidebar-logo" src="/logo-wordmark.webp" alt="weRfam"/><span className="sidebar-caption">FAMILY CONNECTED</span>
      <div className="sidebar-divider"/><div className="sidebar-group-label">WORKSPACE</div>
      <nav className="side-nav">{nav.map(({id,label,Icon}) => <button key={id} onClick={() => setView(id)} className={view === id ? 'selected' : ''}><Icon size={20}/>{label}{view === id && <span className="nav-rail" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="side-security"><span className="security-icon"><ShieldCheck size={21}/></span><b>Private & protected</b><span>Your family circle, your control.</span></div><div className="sidebar-account"><Avatar name={mainName} /><div><b>{mainName}</b><small>{isParent ? 'Parent account' : 'Child account'}</small></div>{!isDemo && <IconButton title="Sign out" onClick={onSignOut}><LogOut size={17}/></IconButton>}</div></div>
    </aside>
    <div className="main-area"><header className="topbar"><div className="mobile-brand"><img src="/logo-wordmark.webp" alt="weRfam"/></div><div className="topbar-context"><span className="breadcrumb">MY WORKSPACE <ChevronRight size={13} /> {view === 'map' ? 'FAMILY MAP' : view === 'family' ? 'MY FAMILY' : 'SETTINGS'}</span><h2>{view === 'map' ? 'Family overview' : view === 'family' ? 'My family circle' : 'Settings & privacy'}</h2></div><div className="topbar-right"><span className="private-chip"><ShieldCheck size={15}/> Private circle</span><Avatar name={mainName} size="small"/></div></header>
      <main className="content"><div className="content-inner">
        {isDemo && <div className="demo-banner"><Eye size={17}/><div><b>Interface preview</b> — people and locations on this screen are sample data, not real tracking.</div><button onClick={() => window.location.reload()}>Sign in <ArrowRight size={15}/></button></div>}
        {message && <div className="inline-banner"><AlertCircle size={17}/><span>{message}</span><IconButton title="Dismiss" onClick={() => setMessage('')}><X size={15}/></IconButton></div>}
        {view === 'map' && <><div className="heading-row"><div><span className="eyebrow">GOOD TO SEE YOU, {mainName.split(' ')[0].toUpperCase()} <span className="wave">✦</span></span><h1>Keep your loved ones <span>close.</span></h1><p>One place to see your family's shared locations.</p></div><div className="heading-date"><Clock3 size={17}/>{new Intl.DateTimeFormat('en-PH',{ weekday:'short', month:'short', day:'numeric' }).format(clock)}</div></div>
          <div className="stats-grid"><div className="stat-card cyan"><div className="stat-icon"><UsersRound size={22}/></div><div><span>Family members</span><b>{effectiveMembers.length + 1} <small>people</small></b></div><span className="stat-accent" /></div><div className="stat-card green"><div className="stat-icon"><Radio size={22}/></div><div><span>Sharing live</span><b>{isParent ? active : (isSharing ? 1 : 0)} <small>active</small></b></div><span className="stat-accent"/></div><div className="stat-card orange"><div className="stat-icon"><ShieldCheck size={22}/></div><div><span>Family circle</span><b className="stat-name">Protected</b></div><span className="stat-accent"/></div></div>
          {!isParent && <div className="sharing-control"><div className="sharing-icon"><Navigation size={23}/></div><div className="sharing-text"><b>Share your live location</b><span>{isSharing ? 'GPS is currently being shared with your linked parent.' : 'Your location is off. Start only when you want to share.'}</span>{gpsNotice && <small className="gps-feedback">{gpsNotice}</small>}</div><button className={isSharing ? 'danger-btn' : 'primary-btn'} disabled={busy || isDemo} onClick={isSharing ? onStopSharing : onStartSharing}>{isSharing ? <><EyeOff size={17}/> Stop sharing</> : <><Radio size={17}/> Start sharing</>}</button></div>}
          <div className="map-and-members"><div className="map-card"><div className="section-card-head"><div><span className="section-kicker"><span className="kicker-dot"/> REAL-TIME VIEW</span><h3><MapPin size={19}/> Family location map</h3></div><span className="refresh-hint"><RefreshCw size={14}/> Updates while devices are active</span></div><FamilyMap members={isParent ? effectiveMembers : [{ user_id: session?.user?.id, profiles: {full_name: mainName },relation:'me'}]} locations={effectiveLocations} preview={isDemo} selectedId={selectedId} onSelect={setSelectedId}/></div>
            <section className="members-card"><div className="section-card-head"><div><span className="section-kicker">YOUR CIRCLE</span><h3>Family members</h3></div><span className="count-bubble">{effectiveMembers.length}</span></div><div className="member-list">{effectiveMembers.length ? effectiveMembers.map((m,idx)=> {const loc = effectiveLocations.find(l=>l.user_id===m.user_id);const status=stateFor(loc);return <button className={`member-row ${selectedId===m.user_id?'focused':''}`} key={m.user_id} onClick={() => setSelectedId(m.user_id)}><Avatar name={m.profiles?.full_name || 'New member'} type={idx%2?'son':'daughter'}/><span className="member-info"><b>{m.profiles?.full_name || 'Not joined yet'}</b><small>{m.relation === 'daughter' ? 'Daughter' : m.relation === 'son' ? 'Son' : 'Family member'} · {loc?.enabled ? timeAgo(loc.updated_at) : 'Location off'}</small></span><span className={`member-state ${status}`}></span><ChevronRight size={15}/></button> }) : <div className="empty-list"><UsersRound size={31}/><b>No children linked yet</b><p>Invite your child to join your private family circle.</p></div>}</div>{isParent && <button className="outline-action" onClick={()=>{setView('family');setShowInvite(true)}}><Plus size={17}/> Add family member</button>}<div className="member-privacy-note"><ShieldCheck size={16}/> Only linked members can appear here.</div></section></div>
          <div className="bottom-info"><div className="info-bubble"><span className="soft-icon cyan"><RadioTower size={19}/></span><div><b>Updates while sharing</b><span>Child devices send GPS updates while their PWA is open and active.</span></div></div><div className="info-bubble"><span className="soft-icon peach"><LockKeyhole size={19}/></span><div><b>Privacy first</b><span>Precise locations are available only to the linked family and the sharing account.</span></div></div></div>
        </>}
        {view === 'family' && <><div className="heading-row"><div><span className="eyebrow">A CIRCLE THAT STAYS TOGETHER</span><h1>Meet your <span>family circle.</span></h1><p>Manage family invitations and see who has joined.</p></div>{isParent && <button className="primary-btn" onClick={()=>setShowInvite(true)}><UserRoundPlus size={18}/> Enroll child</button>}</div>
          <div className="family-management"><div className="family-intro-card"><div className="family-decor"><UsersRound size={32}/></div><span className="section-kicker">PRIVATE FAMILY SPACE</span><h2>{familyName}</h2><p>Invite a son or daughter using a private one-time code. After they join and grant GPS permission, their location can appear on the family map.</p><div className="family-intro-count"><span><UsersRound size={17}/> {effectiveMembers.length + 1} linked people</span><span><ShieldCheck size={17}/> Invitation only</span></div></div><div className="family-roster"><div className="roster-title"><h3>Linked people</h3><span>{effectiveMembers.length + 1} total</span></div><div className="roster-row"><Avatar name={mainName}/><div><b>{mainName}</b><small>{isParent ? 'Family parent · Owner' : 'My account'}</small></div><span className="role-badge owner">{isParent ? 'Parent' : 'Child'}</span></div>{effectiveMembers.map((m,i)=><div className="roster-row" key={m.user_id}><Avatar name={m.profiles?.full_name} type={i%2?'son':'daughter'}/><div><b>{m.profiles?.full_name || 'Member'}</b><small>{m.relation} · {isDemo?'Sample':stateFor(effectiveLocations.find(l=>l.user_id===m.user_id))==='live'?'Location on':'Location private / inactive'}</small></div><span className="role-badge">{m.relation}</span></div>)}{!effectiveMembers.length && <p className="soft-copy">No children have joined. Create an invitation to begin.</p>}</div></div>
          {isParent && <div className="invite-section"><div className="roster-title"><h3>Pending invitations</h3><span>Expires after 14 days</span></div>{isDemo ? <div className="invite-empty">Connect Supabase to create real, one-time family invite codes.</div> : invites.filter(i => !i.used_by && new Date(i.expires_at)>new Date()).length ? invites.filter(i => !i.used_by && new Date(i.expires_at)>new Date()).map(i=><div className="invite-row" key={i.id}><div className="invite-person"><Avatar name={i.child_name} type={i.relation==='son'?'son':'daughter'}/><div><b>{i.child_name}</b><small>{i.relation} · Pending acceptance</small></div></div><div className="invite-code"><code>{i.code}</code><button title="Copy invitation" onClick={()=>copyCode(i.code)}>{copied===i.code?<Check size={17}/>:<Copy size={17}/>}</button></div></div>) : <div className="invite-empty">No pending invitations.</div>}{!isDemo && <p className="invite-help"><LockKeyhole size={15}/> Share an invite code privately with the intended child. Codes work only once.</p>}</div>}
        </>}
        {view === 'settings' && <><div className="heading-row"><div><span className="eyebrow">YOUR SPACE, YOUR CONTROL</span><h1>Privacy & <span>preferences.</span></h1><p>Manage your account and location-sharing choices.</p></div></div><div className="settings-layout"><section className="settings-panel"><h3><UserRound size={20}/> Account</h3><div className="profile-summary"><Avatar name={mainName} size="large"/><div><b>{mainName}</b><span>{isDemo ? 'Sample profile' : session?.user?.email}</span><small>{isParent?'Parent':'Child'} · {familyName}</small></div></div></section><section className="settings-panel"><h3><ShieldCheck size={20}/> Location & privacy</h3><div className="setting-line"><div><b>Family-only location access</b><small>Your precise GPS coordinates aren't public.</small></div><span className="settings-checked"><Check size={17}/> Enabled</span></div><div className="setting-line"><div><b>Location history</b><small>This version stores only the latest shared location, not a movement trail.</small></div><span className="settings-checked">Not saved</span></div><div className="setting-line"><div><b>Background tracking</b><small>A PWA can't promise continuous updates when closed or suspended.</small></div><span className="settings-checked">Limited</span></div>{!isParent && <div className="setting-line"><div><b>Live location sharing</b><small>{isSharing?'Currently broadcasting':'Currently off'}</small></div><button className={isSharing?'danger-btn':'primary-btn'} disabled={busy||isDemo} onClick={isSharing?onStopSharing:onStartSharing}>{isSharing?'Stop':'Start'}</button></div>}</section><section className="settings-panel"><h3><CircleHelp size={20}/> About weRfam</h3><p className="about-copy">Version 0.1 · Parent-managed family invitations, consent-based child sharing and an OpenStreetMap family view.</p>{!isDemo && <button className="signout-button" onClick={onSignOut}><LogOut size={18}/> Sign out</button>}</section></div></>}
      </div></main>
      <nav className="mobile-tabs">{nav.map(({id,label,Icon})=><button key={id} onClick={()=>setView(id)} className={view===id?'selected':''}><Icon size={21}/><span>{label}</span></button>)}</nav>
    </div>
    {showInvite && <div className="modal-scrim" onClick={()=>setShowInvite(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Enroll child" onClick={e=>e.stopPropagation()}><div className="modal-head"><span className="modal-icon"><UserRoundPlus size={22}/></span><IconButton title="Close" onClick={()=>setShowInvite(false)}><X size={19}/></IconButton></div><h2>Enroll your child</h2><p>Create a private invitation. Your child will sign up or sign in on their own device and enter the code to join.</p><form onSubmit={addChild}><label>Child's name</label><input maxLength={80} required placeholder="e.g. Maya Rivera" value={childName} onChange={e=>setChildName(e.target.value)}/><label>Family relationship</label><div className="role-choice"><button type="button" className={relation==='daughter'?'chosen':''} onClick={()=>setRelation('daughter')}><Heart size={17}/> Daughter</button><button type="button" className={relation==='son'?'chosen':''} onClick={()=>setRelation('son')}><Heart size={17}/> Son</button></div><div className="modal-info"><ShieldCheck size={18}/> Your child must explicitly allow location access on their own device. The parent cannot turn it on remotely.</div><button className="primary-btn full" disabled={savingInvite}>{savingInvite?'Creating invitation...':'Generate invite code'} <ArrowRight size={17}/></button></form></div></div>}
  </div>
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [family, setFamily] = useState(null)
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [locations, setLocations] = useState([])
  const [demo, setDemo] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [gpsNotice, setGpsNotice] = useState('')
  const watchIdRef = useRef(null)
  const lastPublishRef = useRef(0)
  const heartbeatRef = useRef(null)

  const loadAccount = useCallback(async (user) => {
    if (!supabase || !user) return
    const { data: person, error: personError } = await supabase.from('profiles').select('id,full_name,role,avatar_url').eq('id',user.id).single()
    if (personError) { setError(`Profile setup error: ${personError.message}. Apply the Supabase SQL migration first.`); return }
    setProfile(person)
    let circle = null
    if (person.role === 'parent') {
      const { data, error } = await supabase.from('families').select('id,name,owner_id').eq('owner_id',user.id).maybeSingle()
      if (error) throw error
      circle = data
    } else {
      const { data, error } = await supabase.from('family_members').select('family_id,relation,families(id,name,owner_id)').eq('user_id',user.id).maybeSingle()
      if (error) throw error
      circle = data?.families || null
    }
    setFamily(circle)
    if (person.role === 'child' && !circle && sessionStorage.getItem('werfam_pending_invite')) {
      const code = sessionStorage.getItem('werfam_pending_invite')
      const { error: redeemError } = await supabase.rpc('redeem_child_invite', { p_code: code })
      if (!redeemError) { sessionStorage.removeItem('werfam_pending_invite'); const { data: membership } = await supabase.from('family_members').select('families(id,name,owner_id)').eq('user_id',user.id).maybeSingle(); circle = membership?.families || null; setFamily(circle) }
      else setError(`Invitation not applied: ${redeemError.message}. You can enter the code again.`)
    }
    if (!circle) { setMembers([]);setInvites([]);setLocations([]);return }
    if (person.role === 'parent') {
      const [memberResult, inviteResult] = await Promise.all([
        supabase.from('family_members').select('user_id,relation,profiles(full_name,avatar_url)').eq('family_id',circle.id),
        supabase.from('child_invites').select('id,child_name,relation,code,expires_at,used_by').eq('family_id',circle.id).order('created_at',{ascending:false})
      ])
      if (memberResult.error) throw memberResult.error
      setMembers(memberResult.data||[])
      setInvites(inviteResult.data||[])
      const ids = (memberResult.data||[]).map(m=>m.user_id)
      if (ids.length) { const {data:locs,error:locError}=await supabase.from('location_latest').select('*').in('user_id',ids);if(locError)throw locError;setLocations(locs||[]) }
      else setLocations([])
    } else {
      setMembers([])
      const {data:locs} = await supabase.from('location_latest').select('*').eq('user_id',user.id)
      setLocations(locs||[])
    }
  }, [])
  const reload = useCallback(async()=> { if(!session?.user)return;try{await loadAccount(session.user);setError('')}catch(err){setError(err.message)} },[session,loadAccount])
  useEffect(() => {
    if (!supabase) {setBooting(false);return}
    let valid = true
    supabase.auth.getSession().then(({data}) => {if(!valid)return;setSession(data.session);setBooting(false)}).catch(err=>{setError(err.message);setBooting(false)})
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, newSession)=>{setSession(newSession)})
    return ()=>{valid=false;subscription.unsubscribe()}
  },[])
  useEffect(()=>{ if(session?.user){setError('');loadAccount(session.user).catch(err=>setError(err.message))}else{setProfile(null);setFamily(null);setMembers([]);setLocations([])} },[session?.user?.id,loadAccount])
  useEffect(()=>{
    if(!session?.user || !family || !supabase) return
    const channel=supabase.channel(`family-view-${family.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'location_latest'},()=>reload())
      .on('postgres_changes',{event:'*',schema:'public',table:'family_members'},()=>reload())
      .subscribe()
    const poll=setInterval(()=>{ if(document.visibilityState==='visible')reload() },12000)
    return()=>{clearInterval(poll);supabase.removeChannel(channel)}
  },[family?.id,session?.user?.id,reload])
  async function signOut(){ if(watchIdRef.current!==null){navigator.geolocation.clearWatch(watchIdRef.current);watchIdRef.current=null} if(heartbeatRef.current!==null){clearInterval(heartbeatRef.current);heartbeatRef.current=null} if(isSharing && profile?.role==='child')await supabase.rpc('set_tracking_enabled',{p_enabled:false});setIsSharing(false);await supabase.auth.signOut() }
  async function addChild(name,relationship){const {error}=await supabase.rpc('create_child_invite',{p_name:name,p_relation:relationship});if(error)throw error;await reload()}
  async function redeem(code){ const {error}=await supabase.rpc('redeem_child_invite',{p_code:code});if(error)throw error;await reload() }
  async function startSharing(){
    setGpsNotice('');if(!navigator.geolocation){setGpsNotice('GPS is not supported by this device.');return}
    if(!window.isSecureContext){setGpsNotice('GPS requires HTTPS (or localhost).');return}
    setBusy(true)
    try {
      // Watch first: location permission is requested locally from the child's device.
      if(navigator.permissions?.query){ try {const p=await navigator.permissions.query({name:'geolocation'});if(p.state==='denied')throw new Error('Location permission denied. Enable GPS permission in your browser settings.')} catch(permError){if(permError.message?.startsWith('Location permission denied'))throw permError /* Safari may not support this permission query */} }
      const {error:enabledError}=await supabase.rpc('set_tracking_enabled',{p_enabled:true});if(enabledError)throw enabledError
      setIsSharing(true)
      const publishFreshPosition = async position => {
        if(Date.now()-lastPublishRef.current<5000)return
        lastPublishRef.current=Date.now()
        const c=position.coords
        const {error:publishError}=await supabase.rpc('publish_location',{p_lat:c.latitude,p_lng:c.longitude,p_accuracy:c.accuracy,p_heading:Number.isFinite(c.heading)?c.heading:null,p_speed:Number.isFinite(c.speed)?c.speed:null})
        if(publishError)setGpsNotice(`Could not update location: ${publishError.message}`)
        else {setGpsNotice(`Sharing · accuracy about ${Math.round(c.accuracy)} m`);const {data:updated}=await supabase.from('location_latest').select('*').eq('user_id',(await supabase.auth.getUser()).data.user.id);setLocations(updated||[])}
      }
      const onGeoError = async geoError => {
        setGpsNotice(`GPS error: ${geoError.message}. Sharing paused.`)
        if(watchIdRef.current!==null){navigator.geolocation.clearWatch(watchIdRef.current);watchIdRef.current=null}
        if(heartbeatRef.current!==null){clearInterval(heartbeatRef.current);heartbeatRef.current=null}
        await supabase.rpc('set_tracking_enabled',{p_enabled:false});setIsSharing(false)
      }
      const gpsOptions={enableHighAccuracy:true,maximumAge:3000,timeout:15000}
      watchIdRef.current=navigator.geolocation.watchPosition(publishFreshPosition,onGeoError,gpsOptions)
      heartbeatRef.current=setInterval(()=>{if(document.visibilityState==='visible')navigator.geolocation.getCurrentPosition(publishFreshPosition,error=>setGpsNotice(`Waiting for GPS: ${error.message}`),gpsOptions)},15000)
    }catch(err){setGpsNotice(err.message);setIsSharing(false);await supabase.rpc('set_tracking_enabled',{p_enabled:false})}finally{setBusy(false)}
  }
  async function stopSharing(){setBusy(true);if(watchIdRef.current!==null){navigator.geolocation.clearWatch(watchIdRef.current);watchIdRef.current=null}if(heartbeatRef.current!==null){clearInterval(heartbeatRef.current);heartbeatRef.current=null}const {error}=await supabase.rpc('set_tracking_enabled',{p_enabled:false});setIsSharing(false);setGpsNotice(error?error.message:'Location sharing stopped. Your latest GPS coordinates were cleared.');setLocations([]);setBusy(false)}
  useEffect(()=>()=>{if(watchIdRef.current!==null && navigator.geolocation)navigator.geolocation.clearWatch(watchIdRef.current);if(heartbeatRef.current!==null)clearInterval(heartbeatRef.current)},[])
  if(booting) return <div className="splash"><img src="/logo-wordmark.webp" alt="weRfam"/><div className="loading-ring"/>Loading family circle...</div>
  if(demo) return <AppShell isDemo onSignOut={()=>setDemo(false)}/>
  if(!session) return <AuthScreen onPreview={()=>setDemo(true)}/>
  if(error && !profile) return <div className="setup-view"><div className="setup-card"><h2>Setup needed</h2><p>{error}</p><button className="primary-btn" onClick={()=>window.location.reload()}>Retry <RefreshCw size={16}/></button><button className="text-link" onClick={signOut}>Sign out</button></div></div>
  if(!profile) return <div className="splash">Loading your profile...</div>
  if(profile.role==='parent'&&!family) return <SetupFamily profile={profile} onComplete={reload} onSignOut={signOut}/>
  if(profile.role==='child'&&!family) return <ChildOnboarding name={profile.full_name} onRedeem={redeem} onSignOut={signOut}/>
  return <AppShell session={session} profile={profile} family={family} members={members} locations={locations} invites={invites} onAddChild={addChild} onRedeem={redeem} onSignOut={signOut} onReload={reload} isSharing={isSharing} onStartSharing={startSharing} onStopSharing={stopSharing} gpsNotice={gpsNotice} busy={busy}/>
}
