import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Copy,
  Crown,
  DoorOpen,
  LockKeyhole,
  QrCode,
  Radio,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { PuzzleTile } from './components/PuzzleTile'
import './App.css'

type Player = {
  id: string
  player_name: string
  group_id: string | null
  tile_index: number
  is_matched: boolean
  is_captain: boolean
}

type Group = {
  id: string
  group_name: string
  master_image_url: string
  team_pin: string | null
  member_count: number
  is_completed: boolean
  is_flex_completed: boolean
  phase2_question: number
  phase2_score: number
  phase2_complete: boolean
  members: Array<Pick<Player, 'id' | 'player_name' | 'tile_index' | 'is_matched' | 'is_captain'>>
}

type PlayerState = { player: Player; group: Group | null }
type PlayerSession = { playerId: string; accessToken: string }
type HostGroup = Pick<Group, 'id' | 'group_name' | 'team_pin' | 'member_count' | 'is_completed' | 'is_flex_completed' | 'phase2_complete'>
type UploadedPhoto = { url: string; fileName: string; sizeBytes: number }
type GameStatus = 'waiting' | 'active' | 'complete'

const SESSION_KEY = 'cipher-match-player-session'
const DEFAULT_IMAGE_URLS = [
  'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1540317580384-e5d43867caa6?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=85',
].map((imageUrl) => {
  const optimizedUrl = new URL(imageUrl)
  optimizedUrl.searchParams.set('w', '900')
  optimizedUrl.searchParams.set('q', '60')
  return optimizedUrl.toString()
})

const TRIVIA_QUESTIONS = [
  {
    prompt: 'Which planet has the most moons currently confirmed?',
    choices: ['Jupiter', 'Saturn', 'Neptune'],
    answer: 1,
  },
  {
    prompt: 'What is the only mammal capable of true flight?',
    choices: ['Flying squirrel', 'Sugar glider', 'Bat'],
    answer: 2,
  },
  {
    prompt: 'Which element has the chemical symbol “W”?',
    choices: ['Tungsten', 'Tin', 'Titanium'],
    answer: 0,
  },
]

const MAX_PHOTO_BYTES = 280 * 1024

async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1440 / bitmap.width, 1440 / bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error(`Could not process ${file.name}.`)
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42, 0.32, 0.24]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= MAX_PHOTO_BYTES) return blob
  }
  throw new Error(`${file.name} could not be compressed below 280 KB. Try a smaller photo.`)
}

function readPlayerSession(): PlayerSession | null {
  try {
    const value = localStorage.getItem(SESSION_KEY)
    if (!value) return null
    const session = JSON.parse(value) as PlayerSession
    return session.playerId && session.accessToken ? session : null
  } catch {
    return null
  }
}

export default function App() {
  const [view, setView] = useState<'player' | 'host'>('player')
  const [playerName, setPlayerName] = useState('')
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(readPlayerSession)
  const [playerState, setPlayerState] = useState<PlayerState | null>(null)
  const [playerLoading, setPlayerLoading] = useState(false)
  const [playerError, setPlayerError] = useState('')
  const [triviaBusy, setTriviaBusy] = useState(false)
  const [teamCode, setTeamCode] = useState('')
  const [hostUserId, setHostUserId] = useState<string | null>(null)
  const [hostVerifiedUserId, setHostVerifiedUserId] = useState<string | null>(null)
  const [hostAccess, setHostAccess] = useState<'checking' | 'signed-out' | 'allowed' | 'denied'>(
    isSupabaseConfigured ? 'checking' : 'signed-out',
  )
  const [hostEmail, setHostEmail] = useState('')
  const [hostPassword, setHostPassword] = useState('')
  const [hostError, setHostError] = useState('')
  const [hostBusy, setHostBusy] = useState(false)
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false)
  const [photoUploadProgress, setPhotoUploadProgress] = useState('')
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([])
  const [lobbyCount, setLobbyCount] = useState(0)
  const [hostGroups, setHostGroups] = useState<HostGroup[]>([])
  const [flexTarget, setFlexTarget] = useState<HostGroup | null>(null)
  const [flexBusy, setFlexBusy] = useState(false)
  const [gameStatus, setGameStatus] = useState<GameStatus>('waiting')
  const [imageUrls, setImageUrls] = useState(DEFAULT_IMAGE_URLS.join('\n'))
  const [hostNotice, setHostNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [joinUrl] = useState(() => `${window.location.origin}${window.location.pathname}`)
  const hostAuthorized = Boolean(hostUserId && hostUserId === hostVerifiedUserId && hostAccess === 'allowed')
  const checkingHostAccess = Boolean(hostUserId && hostUserId !== hostVerifiedUserId)
  const uniqueImageUrls = [...new Set(imageUrls.split('\n').map((url) => url.trim()).filter((url) => /^https:\/\//i.test(url)))]
  const requiredPhotoCount = Math.max(1, Math.round(lobbyCount / 4))
  const photosReady = uniqueImageUrls.length >= requiredPhotoCount

  const refreshPlayerState = async (session: PlayerSession) => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('get_player_state', {
      p_player_id: session.playerId,
      p_access_token: session.accessToken,
    })
    if (error) throw error
    if (!data) throw new Error('Your player session could not be found. Rejoin the lobby.')
    setPlayerState(data as PlayerState)
  }

  const refreshHostDashboard = async () => {
    if (!supabase) return
    const [playersResult, groupsResult, statusResult] = await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }),
      supabase
        .from('groups')
        .select('id, group_name, team_pin, member_count, is_completed, is_flex_completed, phase2_complete')
        .order('group_name'),
      supabase.from('game_settings').select('status').eq('id', 1).maybeSingle(),
    ])

    if (playersResult.error) setHostError(playersResult.error.message)
    else setLobbyCount(playersResult.count ?? 0)
    if (groupsResult.error) setHostError(groupsResult.error.message)
    else setHostGroups((groupsResult.data ?? []) as HostGroup[])
    if (statusResult.error) setHostError(statusResult.error.message)
    else setGameStatus((statusResult.data?.status as GameStatus | undefined) ?? 'waiting')
  }

  useEffect(() => {
    if (!supabase) return

    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setHostUserId(data.session?.user.id ?? null)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setHostUserId(session?.user.id ?? null)
    })
    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !hostUserId) return

    let active = true
    void supabase
      .from('event_hosts')
      .select('user_id')
      .eq('user_id', hostUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        setHostVerifiedUserId(hostUserId)
        if (error || !data) {
          setHostAccess('denied')
          setHostError(error?.message ?? 'This account is not registered as an event host.')
        } else {
          setHostAccess('allowed')
          setHostError('')
        }
      })
    return () => {
      active = false
    }
  }, [hostUserId])

  useEffect(() => {
    if (!supabase || !playerSession) return
    let active = true
    void refreshPlayerState(playerSession)
      .catch((error: Error) => {
        if (active) setPlayerError(error.message)
      })

    const channel = supabase
      .channel(`player-${playerSession.playerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_updates', filter: `player_id=eq.${playerSession.playerId}` },
        () => void refreshPlayerState(playerSession).catch(() => undefined),
      )
      .subscribe()

    return () => {
      active = false
      void channel.unsubscribe()
    }
  }, [playerSession])

  useEffect(() => {
    if (!supabase || !playerState?.group?.id) return
    const channel = supabase
      .channel(`group-${playerState.group.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_updates', filter: `group_id=eq.${playerState.group.id}` },
        () => {
          if (playerSession) void refreshPlayerState(playerSession).catch(() => undefined)
        },
      )
      .subscribe()
    return () => {
      void channel.unsubscribe()
    }
  }, [playerState?.group?.id, playerSession])

  useEffect(() => {
    if (!supabase || !hostAuthorized) return
    void refreshHostDashboard()
    const channel = supabase
      .channel('host-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => void refreshHostDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, () => void refreshHostDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_settings' }, () => void refreshHostDashboard())
      .subscribe()
    return () => {
      void channel.unsubscribe()
    }
  }, [hostAuthorized])

  const handleJoinGame = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!playerName.trim()) return
    if (!supabase) {
      setPlayerError('Add your Supabase URL and anon key to .env.local, then reload the app.')
      return
    }

    setPlayerLoading(true)
    setPlayerError('')
    const accessToken = crypto.randomUUID()
    const { data, error } = await supabase.rpc('register_player', {
      p_player_name: playerName.trim(),
      p_access_token: accessToken,
    })
    if (error) {
      setPlayerError(error.message)
      setPlayerLoading(false)
      return
    }

    const session = { playerId: data as string, accessToken }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setPlayerSession(session)
    setPlayerLoading(false)
  }

  const handlePlayerCheckIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !playerSession) return
    setPlayerError('')
    const { error } = await supabase.rpc('check_in_team', {
      p_player_id: playerSession.playerId,
      p_access_token: playerSession.accessToken,
      p_team_pin: playerState?.player.is_captain
        ? (playerState.group?.team_pin ?? '')
        : teamCode.trim(),
    })
    if (error) {
      setPlayerError(error.message)
      return
    }
    setTeamCode('')
    await refreshPlayerState(playerSession)
  }

  const handleTriviaAnswer = async (answerIndex: number) => {
    if (!supabase || !playerSession || triviaBusy) return
    setTriviaBusy(true)
    setPlayerError('')
    try {
      const { error } = await supabase.rpc('submit_trivia_answer', {
        p_player_id: playerSession.playerId,
        p_access_token: playerSession.accessToken,
        p_answer_index: answerIndex,
      })
      if (error) throw error
      await refreshPlayerState(playerSession)
    } catch (error) {
      setPlayerError(error instanceof Error ? error.message : 'Could not submit your answer.')
    } finally {
      setTriviaBusy(false)
    }
  }

  const handleHostLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setHostBusy(true)
    setHostError('')
    const { error } = await supabase.auth.signInWithPassword({ email: hostEmail, password: hostPassword })
    if (error) setHostError(error.message)
    setHostBusy(false)
  }

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!supabase || files.length === 0) return

    setPhotoUploadBusy(true)
    setHostError('')
    setHostNotice('')
    const uploadedUrls: string[] = []
    try {
      for (const [index, file] of files.entries()) {
        setPhotoUploadProgress(`Compressing ${index + 1} of ${files.length}: ${file.name}`)
        const compressed = await compressPhoto(file)
        const filePath = `${crypto.randomUUID()}.jpg`
        setPhotoUploadProgress(`Uploading ${index + 1} of ${files.length}: ${Math.ceil(compressed.size / 1024)} KB`)
        const { error } = await supabase.storage.from('puzzle-images').upload(filePath, compressed, {
          contentType: 'image/jpeg',
          cacheControl: '31536000',
          upsert: false,
        })
        if (error) throw error
        const url = supabase.storage.from('puzzle-images').getPublicUrl(filePath).data.publicUrl
        uploadedUrls.push(url)
        setUploadedPhotos((current) => [...current, { url, fileName: file.name, sizeBytes: compressed.size }])
        setImageUrls((current) => {
          const customUrls = current.split('\n').map((value) => value.trim()).filter((value) => value && !DEFAULT_IMAGE_URLS.includes(value))
          return [...new Set([...customUrls, url])].join('\n')
        })
        setHostNotice(`Uploaded ${uploadedUrls.length} of ${files.length} selected photo${files.length === 1 ? '' : 's'}.`)
      }

      setHostNotice(`${uploadedUrls.length} photo${uploadedUrls.length === 1 ? '' : 's'} uploaded and ready. Each is under 280 KB.`)
    } catch (error) {
      setHostError(error instanceof Error ? error.message : 'Photo upload failed.')
      if (uploadedUrls.length > 0) {
        setHostNotice(`${uploadedUrls.length} photo${uploadedUrls.length === 1 ? '' : 's'} uploaded successfully; another selected photo failed.`)
      }
    } finally {
      setPhotoUploadBusy(false)
      setPhotoUploadProgress('')
    }
  }

  const handleStartGame = async () => {
    if (!supabase) return
    if (uniqueImageUrls.length < requiredPhotoCount) {
      setHostError(`Add ${requiredPhotoCount} unique HTTPS photos so every team has its own puzzle image.`)
      return
    }
    setHostBusy(true)
    setHostError('')
    setHostNotice('Assigning players to teams…')
    const { error } = await supabase.rpc('start_game', { p_image_urls: uniqueImageUrls })
    if (error) {
      setHostError(error.message)
      setHostNotice('')
    } else {
      setHostNotice('The puzzle is live. Every connected player is receiving a tile.')
      await refreshHostDashboard()
    }
    setHostBusy(false)
  }

  const handleFlexComplete = async () => {
    if (!supabase || !flexTarget) return
    setFlexBusy(true)
    setHostError('')
    const { error } = await supabase.rpc('flex_complete_team', { p_group_id: flexTarget.id })
    if (error) {
      setHostError(error.message)
    } else {
      setHostNotice(`${flexTarget.group_name} was advanced with Flex Complete.`)
      setFlexTarget(null)
      await refreshHostDashboard()
    }
    setFlexBusy(false)
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const handleSignOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setHostGroups([])
    setHostNotice('')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand-lockup" href="/" aria-label="Cipher Match home">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <span>CIPHER <b>MATCH</b></span>
        </a>
        <nav className="view-switch" aria-label="Choose view">
          <button className={view === 'player' ? 'selected' : ''} onClick={() => setView('player')}>Player</button>
          <button className={view === 'host' ? 'selected' : ''} onClick={() => setView('host')}>Host</button>
        </nav>
        <span className={`connection-status ${isSupabaseConfigured ? 'online' : 'offline'}`}>
          <i /> {isSupabaseConfigured ? 'LIVE EVENT' : 'SETUP NEEDED'}
        </span>
      </header>

      {!isSupabaseConfigured && (
        <div className="setup-banner" role="status">
          <CircleHelp size={18} />
          <span>Supabase isn’t configured yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then apply <code>supabase/schema.sql</code>.</span>
        </div>
      )}

      <main className={`main-content ${view === 'host' ? 'host-layout' : 'player-layout'}`}>
        {view === 'player' ? (
          <>
            <section className="player-heading">
              <span className="eyebrow"><span className="eyebrow-dot" /> COMPANY EVENT · TEAM CHALLENGE</span>
              <h1>Find your<br /><em>people.</em></h1>
              <p>One picture. Split into pieces. Find the people holding the rest.</p>
            </section>

            {!playerSession ? (
              <form className="join-panel" onSubmit={handleJoinGame}>
                <div className="panel-topline"><span>01 / CHECK IN</span><Users size={17} /></div>
                <label htmlFor="player-name">Your name</label>
                <input
                  id="player-name"
                  autoComplete="name"
                  maxLength={60}
                  placeholder="e.g. Alex Morgan"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  required
                />
                {playerError && <p className="inline-error" role="alert">{playerError}</p>}
                <button className="button button-primary button-wide" disabled={playerLoading || !playerName.trim()}>
                  {playerLoading ? 'Joining…' : 'Join the lobby'} <ArrowRight size={17} />
                </button>
                <p className="fine-print">Your puzzle piece appears when the host starts the game.</p>
              </form>
            ) : playerSession && !playerState && !playerError ? (
              <section className="join-panel loading-panel"><span className="loader" />Restoring your player session…</section>
            ) : playerError && !playerState ? (
              <section className="join-panel">
                <div className="panel-topline"><span>SESSION ISSUE</span><CircleHelp size={17} /></div>
                <p className="inline-error">{playerError}</p>
                <button className="button button-secondary button-wide" onClick={() => {
                  localStorage.removeItem(SESSION_KEY)
                  setPlayerSession(null)
                  setPlayerError('')
                }}>Rejoin the lobby <ArrowRight size={17} /></button>
              </section>
            ) : playerState ? (
              <section className="player-game">
                <div className="player-greeting">
                  <div><span className="eyebrow">YOU’RE IN</span><h2>Hey, {playerState.player.player_name.split(' ')[0]}.</h2></div>
                  <span className="status-pill"><i /> {playerState.group ? 'PUZZLE LIVE' : 'IN THE LOBBY'}</span>
                </div>
                {!playerState.group ? (
                  <div className="waiting-state">
                    <div className="waiting-orbit"><Radio size={24} /></div>
                    <h3>Keep your phone close.</h3>
                    <p>The host will deal your picture piece to this screen. You can leave it open while you mingle.</p>
                    <div className="waiting-line"><span /><span /><span /><span /></div>
                  </div>
                ) : (
                  <>
                    <div className="team-title"><div><span className="eyebrow">YOUR TEAM</span><h3>{playerState.group.group_name}</h3></div><span className="member-count"><Users size={14} /> {playerState.group.member_count}</span></div>
                    <PuzzleTile imageUrl={playerState.group.master_image_url} tileIndex={playerState.player.tile_index} />
                    {!playerState.group.is_completed ? (
                      <div className="team-checkin">
                        <div className="checkin-copy"><span className="step-number">02</span><div><b>Found your picture crew?</b><p>Ask everyone to check in using the team code.</p></div></div>
                        {playerState.player.is_captain ? (
                          <div className="captain-checkin">
                            <p>Share this code with your picture crew. Everyone else enters it on their own screen.</p>
                            <div className="team-pin-label">TEAM PIN</div>
                            <div className="team-code-display">{playerState.group.team_pin}</div>
                            <form onSubmit={handlePlayerCheckIn}>
                              <button className="button button-primary button-wide">Confirm your team is together <Check size={16} /></button>
                            </form>
                          </div>
                        ) : (
                          <form onSubmit={handlePlayerCheckIn} className="code-form">
                            <label htmlFor="team-code">Enter the code from your team captain</label>
                            <div className="code-input-row">
                              <input id="team-code" type="text" inputMode="numeric" pattern="[0-9]{4}" autoComplete="one-time-code" maxLength={4} placeholder="0000" value={teamCode} onChange={(event) => setTeamCode(event.target.value.replace(/\D/g, '').slice(0, 4))} required />
                              <button className="button button-primary" aria-label="Check in with team"><Check size={18} /></button>
                            </div>
                          </form>
                        )}
                        <div className="member-list" aria-label="Team check-in progress">
                          {playerState.group.members.map((member) => <span key={member.id} className={member.is_matched ? 'member checked-in' : 'member'}><i />{member.player_name.split(' ')[0]}{member.is_captain ? ' · lead' : ''}</span>)}
                        </div>
                        {playerError && <p className="inline-error" role="alert">{playerError}</p>}
                      </div>
                    ) : (
                      <div className="phase-two">
                        <div className="phase-heading"><span className="phase-icon"><CheckCircle2 size={21} /></span><div><span className="eyebrow">PHASE 2 UNLOCKED</span><h3>Team trivia</h3></div></div>
                        {playerState.group.phase2_complete ? (
                          <div className="trivia-complete"><Crown size={24} /><b>Challenge complete</b><span>{playerState.group.phase2_score} / {TRIVIA_QUESTIONS.length} correct</span></div>
                        ) : (
                          <>
                            <div className="trivia-progress"><span>QUESTION {playerState.group.phase2_question + 1} / {TRIVIA_QUESTIONS.length}</span><span>{playerState.group.phase2_score} CORRECT</span></div>
                            <h4>{TRIVIA_QUESTIONS[playerState.group.phase2_question]?.prompt}</h4>
                            {playerState.player.is_captain ? (
                              <div className="trivia-choices">
                                {TRIVIA_QUESTIONS[playerState.group.phase2_question]?.choices.map((choice, index) => (
                                  <button key={choice} disabled={triviaBusy} onClick={() => void handleTriviaAnswer(index)}>{triviaBusy ? 'Submitting…' : choice}<ArrowRight size={15} /></button>
                                ))}
                              </div>
                            ) : (
                              <p className="captain-prompt">Discuss it together. {playerState.group.members.find((member) => member.is_captain)?.player_name.split(' ')[0]} is your team captain and will submit the answer.</p>
                            )}
                            {playerError && <p className="inline-error" role="alert">{playerError}</p>}
                            <p className="fine-print">Talk it through, then submit one answer for your team.</p>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
                <button className="text-button leave-button" onClick={async () => {
                  localStorage.removeItem(SESSION_KEY)
                  setPlayerSession(null)
                  setPlayerState(null)
                  setPlayerError('')
                }}>Leave this device</button>
              </section>
            ) : null}
          </>
        ) : (
          <>
            <section className="host-heading">
              <span className="eyebrow"><span className="eyebrow-dot" /> EVENT CONTROL ROOM</span>
              <h1>Make the room<br /><em>move.</em></h1>
              <p>One tap starts the hunt for every connected player.</p>
            </section>
            {!hostAuthorized ? (
              <form className="host-login" onSubmit={handleHostLogin}>
                <div className="panel-topline"><span>HOST ACCESS</span><LockKeyhole size={17} /></div>
                {checkingHostAccess ? <p>Checking host access…</p> : <>
                  <label htmlFor="host-email">Host email</label>
                  <input id="host-email" type="email" autoComplete="username" value={hostEmail} onChange={(event) => setHostEmail(event.target.value)} required />
                  <label htmlFor="host-password">Password</label>
                  <input id="host-password" type="password" autoComplete="current-password" value={hostPassword} onChange={(event) => setHostPassword(event.target.value)} required />
                  {hostError && <p className="inline-error" role="alert">{hostError}</p>}
                  <button className="button button-primary button-wide" disabled={hostBusy}>{hostBusy ? 'Signing in…' : 'Sign in as host'} <ArrowRight size={17} /></button>
                  <p className="fine-print">Host accounts are created in Supabase Auth and must be added to <code>event_hosts</code>.</p>
                </>}
              </form>
            ) : (
              <div className="host-dashboard">
                <div className="host-toolbar">
                  <div><span className="eyebrow">HOST DASHBOARD</span><h2>Lobby overview</h2></div>
                  <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={() => void handleSignOut()}><DoorOpen size={18} /></button>
                </div>
                <div className="host-stats">
                  <div className="stat"><span>PLAYERS</span><b>{lobbyCount}<small> / 90</small></b><i>registered</i></div>
                  <div className="stat"><span>TEAMS</span><b>{hostGroups.length}</b><i>formed</i></div>
                  <div className="stat"><span>PHASE 2</span><b>{hostGroups.filter((group) => group.phase2_complete).length}</b><i>complete</i></div>
                </div>
                <div className="host-grid">
                  <section className="host-section qr-section">
                    <div className="section-heading"><div><span className="eyebrow">ENTRY POINT</span><h3>Scan to join</h3></div><QrCode size={18} /></div>
                    <div className="qr-code"><QRCodeSVG value={joinUrl} size={150} level="M" includeMargin /></div>
                    <button className="button button-secondary button-wide" onClick={() => void handleCopyLink()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Link copied' : 'Copy player link'}</button>
                  </section>
                  <section className="host-section launch-section">
                    <div className="section-heading"><div><span className="eyebrow">GAME CONTROL</span><h3>{gameStatus === 'waiting' ? 'Ready when you are' : gameStatus === 'active' ? 'The hunt is live' : 'Event complete'}</h3></div><Radio size={18} /></div>
                    <p className="section-description">Players are balanced into teams of three to five. Each team gets a matching four-piece photo.</p>
                    {gameStatus === 'waiting' && <>
                      <label htmlFor="photo-files">Upload master photos <span>compressed under 280 KB</span></label>
                      <input className="photo-file-input" id="photo-files" type="file" accept="image/*" multiple disabled={photoUploadBusy} onChange={handlePhotoUpload} />
                      {photoUploadProgress && <p className="upload-progress" role="status"><Upload size={13} />{photoUploadProgress}</p>}
                      {uploadedPhotos.length > 0 && (
                        <div className="uploaded-photo-list" aria-label="Successfully uploaded photos">
                          <p>UPLOADED PHOTOS</p>
                          {uploadedPhotos.map((photo) => (
                            <div className="uploaded-photo" key={photo.url}>
                              <img src={photo.url} alt="" />
                              <span><b>{photo.fileName}</b><small>{Math.ceil(photo.sizeBytes / 1024)} KB · ready to use</small></span>
                              <CheckCircle2 size={17} aria-label="Upload complete" />
                            </div>
                          ))}
                        </div>
                      )}
                      <label htmlFor="image-urls">Or add pre-optimized HTTPS URLs <span>{uniqueImageUrls.length} available · {requiredPhotoCount} needed</span></label>
                      <textarea id="image-urls" rows={4} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} />
                      <div className={photosReady ? 'photo-readiness ready' : 'photo-readiness needs-photos'} role="status">
                        {photosReady ? <CheckCircle2 size={17} /> : <CircleHelp size={17} />}
                        <span><b>{photosReady ? `${uniqueImageUrls.length} photos available` : `${uniqueImageUrls.length} of ${requiredPhotoCount} photos ready`}</b><small>{photosReady ? `Enough for ${requiredPhotoCount} teams.` : `Add ${requiredPhotoCount - uniqueImageUrls.length} more unique photo${requiredPhotoCount - uniqueImageUrls.length === 1 ? '' : 's'} before starting.`}</small></span>
                      </div>
                    </>}
                    {hostError && <p className="inline-error" role="alert">{hostError}</p>}
                    {hostNotice && <p className="inline-success"><CheckCircle2 size={16} />{hostNotice}</p>}
                    <button className="button button-launch button-wide" disabled={hostBusy || photoUploadBusy || gameStatus !== 'waiting' || lobbyCount < 3 || !photosReady} onClick={() => void handleStartGame()}>
                      {photoUploadBusy ? 'Uploading photos…' : hostBusy ? 'Starting…' : gameStatus === 'waiting' ? <>Start puzzle match <ArrowRight size={17} /></> : <>Game in progress <Radio size={17} /></>}
                    </button>
                    {lobbyCount < 3 && gameStatus === 'waiting' && <p className="fine-print">At least 3 players are needed to start.</p>}
                  </section>
                </div>
                <section className="host-section teams-section">
                  <div className="section-heading"><div><span className="eyebrow">LIVE PROGRESS</span><h3>Team status</h3></div><span className="live-tag"><i /> LIVE</span></div>
                  {hostGroups.length === 0 ? <p className="empty-teams">Teams appear here as soon as the puzzle starts.</p> : (
                    <div className="team-status-list">
                      {hostGroups.map((group) => (
                        <div className="team-status-row" key={group.id}>
                          <span className="team-status-name">{group.group_name}<small>{group.member_count} players · PIN {group.team_pin ?? '----'}</small></span>
                          <span className={group.is_completed ? 'team-state complete' : 'team-state'}>
                            {group.is_flex_completed ? 'Flex complete' : group.is_completed ? <><CheckCircle2 size={14} /> Phase 2</> : 'Finding team'}
                          </span>
                          <span className="team-score">{group.phase2_complete ? 'Trivia done' : group.is_completed ? 'Playing' : 'Hunting'}</span>
                          {!group.is_completed && <button className="button button-flex" onClick={() => setFlexTarget(group)}>Flex complete</button>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>
      {flexTarget && (
        <div className="dialog-backdrop">
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="flex-title">
            <span className="eyebrow">HOST OVERRIDE</span>
            <h2 id="flex-title">Flex-complete {flexTarget.group_name}?</h2>
            <p>This marks every remaining teammate present and unlocks Phase 2 for this team. Use it for late arrivals, no-shows, or an agreed wildcard tile.</p>
            <div className="dialog-actions">
              <button className="button button-secondary" disabled={flexBusy} onClick={() => setFlexTarget(null)}>Cancel</button>
              <button className="button button-launch" disabled={flexBusy} onClick={() => void handleFlexComplete()}>{flexBusy ? 'Completing…' : 'Auto-complete team'}</button>
            </div>
          </section>
        </div>
      )}
      <footer className="page-footer"><span>THE CIPHER MATCH</span><span>FIND THE PIECES. FIND YOUR PEOPLE.</span></footer>
    </div>
  )
}