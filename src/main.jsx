import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const STORAGE_KEYS = {
  likes: "shortform.likes.v1",
  comments: "shortform.comments.v1",
  aspects: "shortform.aspects.v1"
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const videoPath = (video, mode = "watch") => `/${mode}/${encodeURIComponent(video.id)}`;
const channelPath = (name) => `/channel/${encodeURIComponent(name)}`;
const absoluteVideoUrl = (video, mode = "watch") => `${window.location.origin}${videoPath(video, mode)}`;

function writeRoute(path, replace = false) {
  const next = `${window.location.origin}${path}`;
  if (window.location.href === next) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
}

function copyText(value) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).catch(() => {});
    return;
  }
  const input = document.createElement("input");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function routeFromLocation(videos, feedVideos) {
  const [kind, rawValue] = window.location.pathname.split("/").filter(Boolean);
  const value = rawValue ? decodeURIComponent(rawValue) : "";
  if ((kind === "watch" || kind === "short" || kind === "video") && value) {
    const video = videos.find((item) => item.id === value);
    if (!video) return null;
    const feedIndex = feedVideos.findIndex((item) => item.id === video.id);
    return feedIndex >= 0 && kind !== "watch"
      ? { screen: "home", activeIndex: feedIndex }
      : { screen: "watch", watchVideoId: video.id };
  }
  if (kind === "channel" && value) {
    return videos.some((item) => item.channel === value) ? { screen: "channel", channel: value } : null;
  }
  return null;
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function useLocalStorageState(key, fallback) {
  const [value, setValue] = useState(() => readStorage(key, fallback));

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function useViewportHeight() {
  const [height, setHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    window.addEventListener("resize", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return height;
}

function randomizeByChannel(source) {
  const buckets = new Map();
  for (const video of source) {
    const bucket = buckets.get(video.channel) ?? [];
    bucket.push(video);
    buckets.set(video.channel, bucket);
  }
  for (const bucket of buckets.values()) {
    for (let index = bucket.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [bucket[index], bucket[swap]] = [bucket[swap], bucket[index]];
    }
  }
  const channels = Array.from(buckets.keys());
  const feed = [];
  while (channels.length) {
    const channelIndex = Math.floor(Math.random() * channels.length);
    const channel = channels[channelIndex];
    const bucket = buckets.get(channel);
    const next = bucket.pop();
    if (next) feed.push(next);
    if (!bucket.length) channels.splice(channelIndex, 1);
  }
  return feed;
}

function getCategory(video, aspectMap) {
  const ratio = aspectMap[video.id]?.ratio;
  if (ratio) return ratio >= 1.2 ? "videos" : "shorts";
  if (video.category === "videos" || video.aspectRatio === "16:9") return "videos";
  return "shorts";
}

function Icon({ children, className = "", filled = false }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {children}
    </span>
  );
}

function App() {
  const [videos, setVideos] = useState([]);
  const [manifestReady, setManifestReady] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [screen, setScreen] = useState("home");
  const [channel, setChannel] = useState(null);
  const [watchVideoId, setWatchVideoId] = useState(null);
  const [muted, setMuted] = useState(true);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [likes, setLikes] = useLocalStorageState(STORAGE_KEYS.likes, {});
  const [comments, setComments] = useLocalStorageState(STORAGE_KEYS.comments, {});
  const [aspectMap, setAspectMap] = useLocalStorageState(STORAGE_KEYS.aspects, {});

  useEffect(() => {
    let cancelled = false;
    fetch("/data/videos.json", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Manifest failed: ${response.status}`);
        return response.json();
      })
      .then((items) => {
        if (!cancelled) setVideos(items);
      })
      .catch(() => {
        if (!cancelled) setVideos([]);
      })
      .finally(() => {
        if (!cancelled) setManifestReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const randomizedVideos = useMemo(() => randomizeByChannel(videos), [videos]);
  const feedVideos = useMemo(
    () => randomizedVideos.filter((video) => getCategory(video, aspectMap) === "shorts"),
    [aspectMap, randomizedVideos]
  );
  const channels = useMemo(() => {
    const byName = new Map();
    for (const video of videos) {
      const stats = byName.get(video.channel) ?? { name: video.channel, shorts: 0, videos: 0 };
      stats[getCategory(video, aspectMap)] += 1;
      byName.set(video.channel, stats);
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [aspectMap]);

  const activeVideo = feedVideos[activeIndex] ?? feedVideos[0];
  const watchVideo = videos.find((video) => video.id === watchVideoId);
  const selectedChannelVideos = useMemo(
    () => videos.filter((video) => video.channel === channel),
    [channel]
  );

  useEffect(() => {
    setActiveIndex((index) => clamp(index, 0, Math.max(feedVideos.length - 1, 0)));
  }, [feedVideos.length]);

  const registerAspect = useCallback((id, width, height) => {
    if (!width || !height) return;
    const ratio = Number((width / height).toFixed(3));
    setAspectMap((current) => {
      if (current[id]?.ratio === ratio) return current;
      return {
        ...current,
        [id]: { ratio, width, height, category: ratio >= 1.2 ? "videos" : "shorts" }
      };
    });
  }, [setAspectMap]);

  const openChannel = useCallback((name) => {
    setChannel(name);
    setWatchVideoId(null);
    setScreen("channel");
    writeRoute(channelPath(name));
  }, []);

  const openVideo = useCallback((id, mode = "watch") => {
    const index = feedVideos.findIndex((video) => video.id === id);
    if (index >= 0 && mode === "short") {
      setActiveIndex(index);
      setWatchVideoId(null);
      setChannel(null);
      setScreen("home");
      writeRoute(videoPath(feedVideos[index], "short"));
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("lumina:jump", { detail: { index } }));
      });
      return;
    }
    setWatchVideoId(id);
    setChannel(null);
    setScreen("watch");
    const video = videos.find((item) => item.id === id);
    if (video) writeRoute(videoPath(video, "watch"));
  }, [feedVideos, videos]);

  useEffect(() => {
    if (!manifestReady || !videos.length) return;

    const applyRoute = () => {
      const route = routeFromLocation(videos, feedVideos);
      if (!route) return;
      if (route.screen === "home") {
        setActiveIndex(route.activeIndex);
        setWatchVideoId(null);
        setChannel(null);
        setScreen("home");
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent("lumina:jump", { detail: { index: route.activeIndex } }));
        });
      } else if (route.screen === "watch") {
        setWatchVideoId(route.watchVideoId);
        setChannel(null);
        setScreen("watch");
      } else if (route.screen === "channel") {
        setChannel(route.channel);
        setWatchVideoId(null);
        setScreen("channel");
      }
    };

    applyRoute();
    window.addEventListener("popstate", applyRoute);
    return () => window.removeEventListener("popstate", applyRoute);
  }, [manifestReady, videos, feedVideos]);

  useEffect(() => {
    if (screen === "home" && activeVideo) {
      writeRoute(videoPath(activeVideo, "short"), true);
    }
  }, [activeVideo, screen]);

  const toggleLike = useCallback((id) => {
    setLikes((current) => ({ ...current, [id]: !current[id] }));
  }, [setLikes]);

  const addComment = useCallback((id, body) => {
    const text = body.trim();
    if (!text) return;
    setComments((current) => ({
      ...current,
      [id]: [
        ...(current[id] ?? []),
        { id: crypto.randomUUID(), body: text, createdAt: new Date().toISOString() }
      ]
    }));
  }, [setComments]);

  const showShell = screen !== "home";

  if (!manifestReady) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border border-white/10 border-t-secondary animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-background text-on-surface selection:bg-secondary/30 min-h-screen overflow-hidden">
      {showShell && (
        <>
          <TopNav onNavigate={setScreen} muted={muted} onToggleMuted={() => setMuted((value) => !value)} />
          <SideNav active={screen} onNavigate={setScreen} channels={channels} onOpenChannel={openChannel} />
        </>
      )}

      {screen === "home" && (
        <>
          <TopNav onNavigate={setScreen} muted={muted} onToggleMuted={() => setMuted((value) => !value)} />
          <SideNav active="home" onNavigate={setScreen} channels={channels} onOpenChannel={openChannel} />
          <Feed
            videos={feedVideos}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            muted={muted}
            pausedByUser={pausedByUser}
            setPausedByUser={setPausedByUser}
            likes={likes}
            comments={comments}
            onAspect={registerAspect}
            onToggleLike={toggleLike}
            onOpenComments={(id) => openVideo(id)}
            onOpenChannel={openChannel}
          />
          <MobileNav active="home" onNavigate={setScreen} />
        </>
      )}

      {screen === "discover" && (
        <DiscoverScreen
          videos={videos}
          channels={channels}
          aspectMap={aspectMap}
          onSelect={openVideo}
          onOpenChannel={openChannel}
        />
      )}

      {screen === "notifications" && (
        <NotificationsScreen comments={comments} likes={likes} channels={channels} />
      )}

      {screen === "settings" && <SettingsScreen videos={videos} channels={channels} />}
      {screen === "premium" && <PremiumScreen />}
      {screen === "upload" && <UploadScreen />}

      {screen === "channel" && channel && (
        <CreatorChannelScreen
          channel={channel}
          videos={selectedChannelVideos}
          aspectMap={aspectMap}
          likedCount={selectedChannelVideos.filter((video) => likes[video.id]).length}
          onBack={() => setScreen("home")}
          onSelect={openVideo}
          onAspect={registerAspect}
        />
      )}

      {screen === "watch" && watchVideo && (
        <WatchScreen
          video={watchVideo}
          suggestions={videos.filter((video) => video.id !== watchVideo.id).slice(0, 8)}
          comments={comments[watchVideo.id] ?? []}
          liked={Boolean(likes[watchVideo.id])}
          muted={muted}
          onMuted={() => setMuted((value) => !value)}
          onBack={() => setScreen("home")}
          onToggleLike={() => toggleLike(watchVideo.id)}
          onAddComment={addComment}
          onSelect={openVideo}
          onOpenChannel={openChannel}
          onAspect={registerAspect}
        />
      )}

      {showShell && <MobileNav active={screen} onNavigate={setScreen} />}
    </div>
  );
}

function TopNav({ onNavigate, muted, onToggleMuted }) {
  return (
    <header className="fixed top-0 w-full z-50 bg-surface/70 backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-gutter h-16">
      <div className="flex items-center gap-8">
        <button className="font-display-lg text-display-lg font-bold tracking-tighter text-primary bg-transparent" type="button" onClick={() => onNavigate("home")}>
          LUMINA
        </button>
        <div className="hidden md:flex items-center bg-white/5 rounded-full px-4 py-2 border border-white/10 w-96 group focus-within:border-secondary transition-all">
          <Icon className="text-on-surface-variant mr-3">search</Icon>
          <input
            className="bg-transparent border-none outline-none text-body-sm font-label-caps w-full placeholder:text-on-surface-variant/50"
            placeholder="SEARCH CONTENT..."
            onFocus={() => onNavigate("discover")}
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <button className="p-2 text-on-surface-variant hover:bg-white/10 transition-colors rounded-full active:scale-95 duration-150" type="button" onClick={() => onNavigate("upload")}>
          <Icon>upload</Icon>
        </button>
        <button className="p-2 text-on-surface-variant hover:bg-white/10 transition-colors rounded-full active:scale-95 duration-150 relative" type="button" onClick={() => onNavigate("notifications")}>
          <Icon>notifications</Icon>
          <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full"></span>
        </button>
        <button className="p-2 text-on-surface-variant hover:bg-white/10 transition-colors rounded-full active:scale-95 duration-150" type="button" onClick={onToggleMuted}>
          <Icon>{muted ? "volume_off" : "volume_up"}</Icon>
        </button>
        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 bg-secondary text-on-primary flex items-center justify-center font-bold">L</div>
      </div>
    </header>
  );
}

function SideNav({ active, onNavigate, channels, onOpenChannel }) {
  const items = [
    ["home", "home", "Home"],
    ["discover", "explore", "Explore"],
    ["channel", "subscriptions", "Subscriptions"],
    ["settings", "video_library", "Library"],
    ["notifications", "history", "History"]
  ];

  return (
    <nav className="hidden md:flex flex-col pt-20 pb-8 fixed left-0 top-0 h-full w-64 z-40 bg-surface/70 backdrop-blur-xl border-r border-white/10 shadow-none transition-all duration-300 ease-in-out">
      <div className="flex flex-col gap-1 px-4 mb-8">
        {items.map(([id, icon, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id === "channel" ? "discover" : id)}
            className={`flex items-center gap-4 px-6 py-3 hover:bg-white/5 rounded-xl cursor-pointer transition-all duration-300 ease-in-out font-label-caps text-label-caps text-left ${
              active === id ? "text-primary border-l-4 border-secondary bg-secondary/10" : "text-on-surface-variant"
            }`}
          >
            <Icon filled={active === id}>{icon}</Icon>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-8 px-6">
        <p className="text-[10px] text-on-surface-variant font-label-caps opacity-50 uppercase tracking-widest mb-4">Suggested</p>
        <div className="space-y-4">
          {channels
            .slice()
            .sort((a, b) => b.shorts - a.shorts || a.name.localeCompare(b.name))
            .slice(0, 6)
            .map((channel) => (
            <button key={channel.name} type="button" onClick={() => onOpenChannel(channel.name)} className="flex items-center gap-3 bg-transparent text-left w-full rounded-xl px-2 py-1 hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-full border border-white/10 bg-secondary text-on-primary flex items-center justify-center font-bold">
                {channel.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <p className="text-body-sm font-bold text-on-surface leading-tight">@{channel.name}</p>
                <p className="text-[10px] text-on-surface-variant font-label-caps">{channel.shorts} shorts</p>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-auto px-4 flex flex-col gap-1">
        <div className="px-6 py-4 bg-secondary/5 rounded-2xl border border-secondary/20 mb-4">
          <p className="font-label-caps text-[10px] text-secondary mb-1">LOCAL ACCESS</p>
          <p className="text-body-sm font-bold text-on-surface mb-3 leading-tight">Offline manifest</p>
          <button className="w-full bg-secondary text-on-primary py-2 rounded-lg text-label-caps font-bold active:scale-95 transition-transform" type="button" onClick={() => onNavigate("premium")}>
            DETAILS
          </button>
        </div>
        <button className="flex items-center gap-4 text-on-surface-variant px-6 py-3 hover:bg-white/5 rounded-xl cursor-pointer font-label-caps text-label-caps" type="button" onClick={() => onNavigate("settings")}>
          <Icon>settings</Icon> Settings
        </button>
        <button className="flex items-center gap-4 text-on-surface-variant px-6 py-3 hover:bg-white/5 rounded-xl cursor-pointer font-label-caps text-label-caps" type="button">
          <Icon>help_outline</Icon> Help
        </button>
      </div>
    </nav>
  );
}

function MobileNav({ active, onNavigate }) {
  const items = [
    ["home", "home", "Home"],
    ["discover", "explore", "Explore"],
    ["upload", "add", ""],
    ["notifications", "subscriptions", "Subs"],
    ["settings", "video_library", "Library"]
  ];

  return (
    <footer className="md:hidden fixed bottom-0 left-0 w-full bg-surface/70 backdrop-blur-xl border-t border-white/10 z-50 flex justify-around items-center h-16 px-4">
      {items.map(([id, icon, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onNavigate(id)}
          className={id === "upload"
            ? "w-12 h-12 -mt-8 bg-secondary text-on-secondary rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
            : `flex flex-col items-center gap-1 ${active === id ? "text-primary" : "text-on-surface-variant"}`}
        >
          <Icon filled={active === id || id === "home"} className={id === "upload" ? "text-3xl" : ""}>{icon}</Icon>
          {label && <span className="text-[10px] font-label-caps">{label}</span>}
        </button>
      ))}
    </footer>
  );
}

function Feed(props) {
  const {
    videos: feedVideos,
    activeIndex,
    setActiveIndex,
    muted,
    pausedByUser,
    setPausedByUser,
    likes,
    comments,
    onAspect,
    onToggleLike,
    onOpenComments,
    onOpenChannel
  } = props;
  const containerRef = useRef(null);
  const frameRef = useRef(null);
  const viewportHeight = useViewportHeight();
  const first = clamp(activeIndex - 2, 0, Math.max(feedVideos.length - 1, 0));
  const last = clamp(activeIndex + 2, 0, Math.max(feedVideos.length - 1, 0));
  const visibleVideos = feedVideos.slice(first, last + 1);
  const rowHeight = Math.max(viewportHeight - 64, 1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const jump = (event) => {
      container.scrollTo({ top: event.detail.index * rowHeight, behavior: "instant" });
    };
    window.addEventListener("lumina:jump", jump);
    return () => window.removeEventListener("lumina:jump", jump);
  }, [rowHeight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const next = clamp(Math.round(container.scrollTop / rowHeight), 0, Math.max(feedVideos.length - 1, 0));
        setActiveIndex((current) => (current === next ? current : next));
        setPausedByUser(false);
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [feedVideos.length, rowHeight, setActiveIndex, setPausedByUser]);

  return (
    <main className="md:ml-64 pt-16 h-screen overflow-hidden">
      <div ref={containerRef} className="h-full overflow-y-scroll no-scrollbar vertical-snap">
        <div style={{ height: first * rowHeight }} aria-hidden="true" />
        {visibleVideos.map((video, offset) => {
          const index = first + offset;
          return (
            <ShortSection
              key={video.id}
              video={video}
              active={index === activeIndex}
              near={Math.abs(index - activeIndex) <= 1}
              muted={muted}
              pausedByUser={pausedByUser}
              liked={Boolean(likes[video.id])}
              commentCount={(comments[video.id] ?? []).length}
              onAspect={onAspect}
              onToggleLike={onToggleLike}
              onOpenComments={onOpenComments}
              onOpenChannel={onOpenChannel}
              onCopyLink={() => copyText(absoluteVideoUrl(video, "short"))}
              onTogglePlayback={() => setPausedByUser((value) => !value)}
            />
          );
        })}
        <div style={{ height: (feedVideos.length - last - 1) * rowHeight }} aria-hidden="true" />
      </div>
    </main>
  );
}

const ShortSection = memo(function ShortSection(props) {
  const {
    video,
    active,
    near,
    muted,
    pausedByUser,
    liked,
    commentCount,
    onAspect,
    onToggleLike,
    onOpenComments,
    onOpenChannel,
    onCopyLink,
    onTogglePlayback
  } = props;
  const videoRef = useRef(null);
  const activeRef = useRef(active);
  const pausedByUserRef = useRef(pausedByUser);

  useEffect(() => {
    activeRef.current = active;
    pausedByUserRef.current = pausedByUser;
  }, [active, pausedByUser]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    node.muted = muted;
    if (active && !pausedByUser) {
      const play = node.play();
      if (play?.catch) play.catch(() => {});
    } else {
      node.pause();
    }
  }, [active, muted, pausedByUser]);

  const recoverPlayback = useCallback(() => {
    const node = videoRef.current;
    if (!node || !activeRef.current || pausedByUserRef.current || document.hidden) return;
    const play = node.play();
    if (play?.catch) play.catch(() => {});
  }, []);

  return (
    <section className="h-full w-full flex items-center justify-center snap-section relative py-4 px-4 md:py-10">
      <div className="relative w-full max-w-[480px] h-full bg-surface-container-low rounded-[40px] overflow-hidden border border-white/10 shadow-2xl">
        <div className="absolute inset-0 w-full h-full" onClick={onTogglePlayback}>
          {near && (
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              src={video.src}
              muted={muted}
              playsInline
              loop
              preload={near ? "auto" : "metadata"}
              onLoadedMetadata={(event) => onAspect(video.id, event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
              onPause={recoverPlayback}
              onStalled={recoverPlayback}
              onWaiting={recoverPlayback}
            />
          )}
          <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/20">
            <div className="h-full bg-secondary active-glow w-1/3 transition-all duration-1000"></div>
          </div>
        </div>

        <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6 z-10">
          <div className="flex flex-col items-center gap-1">
            <button className="w-12 h-12 rounded-full glass-panel flex items-center justify-center text-on-surface active:scale-90 transition-transform" type="button" onClick={(event) => { event.stopPropagation(); onToggleLike(video.id); }}>
              <Icon className={liked ? "text-secondary" : ""} filled={liked}>favorite</Icon>
            </button>
            <span className="font-label-caps text-[10px]">{liked ? "SAVED" : "SAVE"}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button className="w-12 h-12 rounded-full glass-panel flex items-center justify-center text-on-surface active:scale-90 transition-transform" type="button" onClick={(event) => { event.stopPropagation(); onOpenComments(video.id); }}>
              <Icon>comment</Icon>
            </button>
            <span className="font-label-caps text-[10px]">{commentCount}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button className="w-12 h-12 rounded-full glass-panel flex items-center justify-center text-on-surface active:scale-90 transition-transform" type="button" onClick={(event) => { event.stopPropagation(); onCopyLink(); }}>
              <Icon>share</Icon>
            </button>
            <span className="font-label-caps text-[10px]">Share</span>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-4 mb-4">
            <button className="relative bg-transparent" type="button" onClick={(event) => { event.stopPropagation(); onOpenChannel(video.channel); }}>
              <div className="w-12 h-12 rounded-full border-2 border-secondary p-[2px] bg-secondary text-on-secondary flex items-center justify-center font-bold">
                {video.channel.slice(0, 1).toUpperCase()}
              </div>
              <div className="absolute -bottom-1 -right-1 bg-secondary text-on-secondary rounded-full p-[2px]">
                <Icon className="text-[12px] block">add</Icon>
              </div>
            </button>
            <div>
              <button className="font-title-md text-title-md text-white bg-transparent" type="button" onClick={(event) => { event.stopPropagation(); onOpenChannel(video.channel); }}>
                @{video.channel}
              </button>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-label-caps text-[10px] text-on-surface-variant flex items-center gap-1">
                  <Icon className="text-[14px]">music_note</Icon>
                  Local Audio
                </span>
              </div>
            </div>
          </div>
          <p className="text-body-sm text-on-surface/90 line-clamp-2 mb-4">
            {video.title} #local #shorts #lumina
          </p>
        </div>
      </div>
    </section>
  );
});

function DiscoverScreen({ videos: allVideos, channels, aspectMap, onSelect, onOpenChannel }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const source = allVideos.filter((video) => getCategory(video, aspectMap) === "shorts");
    const needle = query.trim().toLowerCase();
    if (!needle) return source.slice(0, 18);
    return source
      .filter((video) => `${video.channel} ${video.title} ${video.fileName}`.toLowerCase().includes(needle))
      .slice(0, 48);
  }, [allVideos, aspectMap, query]);

  return (
    <main className="md:ml-64 pt-16 min-h-screen bg-background text-on-surface selection:bg-secondary/30 overflow-auto">
      <div className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <section className="flex flex-col items-center mb-16">
          <div className="w-full max-w-2xl relative">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
              <Icon className="text-secondary">search</Icon>
            </div>
            <input
              className="w-full h-16 pl-16 pr-6 bg-surface-container-low border border-white/10 rounded-full font-label-caps text-body-lg focus:ring-2 focus:ring-secondary/50 focus:border-secondary outline-none search-inner-glow transition-all"
              placeholder="Search cinematic shorts, creators, or tags..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <span className="font-label-caps text-label-caps text-on-surface-variant mr-2 self-center">Trending Now:</span>
            {["#AIGen", "#Cyberpunk2077", "#AbstractMotion", "#4KHDR", "#MinimalistVibes"].map((tag) => (
              <button key={tag} className="px-4 py-2 rounded-full bg-secondary/10 border border-secondary/30 text-secondary font-label-caps hover:bg-secondary/20 transition-colors" type="button">
                {tag}
              </button>
            ))}
          </div>
        </section>

        <div className="flex flex-col md:flex-row gap-8">
          <aside className="w-full md:w-64 flex-shrink-0 space-y-10">
            <div>
              <h3 className="font-label-caps text-label-caps text-primary mb-4 tracking-widest uppercase">Channels</h3>
              <div className="space-y-3">
                {channels.map((item) => (
                  <button key={item.name} type="button" onClick={() => onOpenChannel(item.name)} className="flex items-center gap-3 cursor-pointer group bg-transparent text-left">
                    <span className="w-4 h-4 rounded border border-white/20 bg-surface-container text-secondary"></span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant group-hover:text-on-surface">@{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-title-md text-title-md">Results for <span className="text-secondary italic">"{query || "Local Shorts"}"</span></h2>
              <span className="font-label-caps text-label-caps text-on-surface-variant">{filtered.length} Results found</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((video) => (
                <SearchResultCard key={video.id} video={video} onSelect={onSelect} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function SearchResultCard({ video, onSelect }) {
  return (
    <button className="group relative bg-surface-container-low rounded-xl overflow-hidden border border-white/5 hover:border-secondary/50 transition-all duration-300 text-left" type="button" onClick={() => onSelect(video.id)}>
      <div className="aspect-[9/16] relative">
        <video className="w-full h-full object-cover" src={video.src} muted playsInline preload="metadata" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity"></div>
        <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md px-2 py-1 rounded font-label-caps text-[10px] text-white">LOCAL</div>
        <div className="absolute bottom-4 left-4 right-4">
          <h4 className="font-body-lg text-body-lg text-white font-semibold line-clamp-2">{video.title}</h4>
          <p className="font-label-caps text-[10px] text-secondary mt-1">@{video.channel}</p>
        </div>
      </div>
    </button>
  );
}

function CreatorChannelScreen({ channel, videos: channelVideos, aspectMap, likedCount, onBack, onSelect, onAspect }) {
  const [tab, setTab] = useState("videos");
  const categorized = useMemo(() => ({
    shorts: channelVideos.filter((video) => getCategory(video, aspectMap) === "shorts"),
    videos: channelVideos.filter((video) => getCategory(video, aspectMap) === "videos")
  }), [aspectMap, channelVideos]);
  const visible = categorized[tab];
  const cover = channelVideos[0];

  return (
    <main className="md:ml-64 pt-16 min-h-screen bg-background text-on-surface font-body-lg overflow-auto">
      <section className="relative h-[300px] md:h-[400px] w-full overflow-hidden">
        {cover && <video className="w-full h-full object-cover blur-sm scale-105 opacity-60" src={cover.src} muted playsInline preload="metadata" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
      </section>
      <section className="max-w-7xl mx-auto px-margin-mobile md:px-margin-desktop -mt-20 relative z-10">
        <div className="flex flex-col md:flex-row items-end md:items-center justify-between gap-6 bg-surface/40 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl">
          <div className="flex flex-col md:flex-row items-center gap-8 w-full md:w-auto">
            <div className="relative">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-[4px] border-secondary p-1 bg-background">
                <div className="w-full h-full rounded-full overflow-hidden bg-secondary text-on-secondary flex items-center justify-center text-5xl font-bold">
                  {channel.slice(0, 1).toUpperCase()}
                </div>
              </div>
              <div className="absolute bottom-2 right-2 w-6 h-6 bg-secondary border-4 border-background rounded-full"></div>
            </div>
            <div className="text-center md:text-left">
              <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2">@{channel}</h1>
              <p className="font-label-caps text-label-caps text-on-surface-variant mb-4 uppercase tracking-widest">Local Creator Channel</p>
              <div className="flex items-center justify-center md:justify-start gap-6">
                <Stat value={categorized.videos.length} label="Videos" />
                <Divider />
                <Stat value={categorized.shorts.length} label="Shorts" />
                <Divider />
                <Stat value={likedCount} label="Saved" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button className="flex-1 md:flex-none px-12 py-4 bg-secondary text-on-primary font-bold font-label-caps rounded-full active:scale-95 transition-all duration-150 shadow-[0_0_20px_rgba(137,206,255,0.3)]" type="button" onClick={onBack}>
              BACK
            </button>
            <button className="p-4 bg-white/5 border border-white/10 rounded-full text-on-surface-variant hover:bg-white/10 transition-colors" type="button">
              <Icon>share</Icon>
            </button>
          </div>
        </div>
        <div className="mt-12 flex items-center gap-8 border-b border-white/5 pb-4 overflow-x-auto no-scrollbar">
          <button className={`font-label-caps text-label-caps pb-4 px-2 whitespace-nowrap ${tab === "videos" ? "text-primary border-b-2 border-secondary" : "text-on-surface-variant hover:text-on-surface transition-colors"}`} type="button" onClick={() => setTab("videos")}>VIDEOS</button>
          <button className={`font-label-caps text-label-caps pb-4 px-2 whitespace-nowrap ${tab === "shorts" ? "text-primary border-b-2 border-secondary" : "text-on-surface-variant hover:text-on-surface transition-colors"}`} type="button" onClick={() => setTab("shorts")}>SHORTS</button>
          <button className="font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface pb-4 px-2 whitespace-nowrap transition-colors" type="button">PLAYLISTS</button>
          <button className="font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface pb-4 px-2 whitespace-nowrap transition-colors" type="button">ABOUT</button>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-20">
          {visible.map((video) => (
            <ChannelCard key={video.id} video={video} tab={tab} onSelect={onSelect} onAspect={onAspect} />
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ value, label }) {
  return (
    <div className="text-center md:text-left">
      <p className="font-headline-lg text-title-md text-primary">{value}</p>
      <p className="font-label-caps text-[10px] text-on-surface-variant uppercase">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-white/10"></div>;
}

function ChannelCard({ video, tab, onSelect, onAspect }) {
  return (
    <button className="group cursor-pointer bg-transparent text-left" type="button" onClick={() => onSelect(video.id)}>
      <div className={`relative ${tab === "videos" ? "aspect-video" : "aspect-[9/16]"} rounded-2xl overflow-hidden mb-4 border border-white/10 video-card-glow transition-all duration-300`}>
        <video
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          src={video.src}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => onAspect(video.id, event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
          <div className="flex items-center gap-2 text-white font-label-caps text-[10px]">
            <Icon className="text-sm" filled>play_arrow</Icon>
            LOCAL
          </div>
        </div>
        <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
          <p className="font-label-caps text-[10px] text-white">{tab === "videos" ? "VIDEO" : "SHORT"}</p>
        </div>
      </div>
      <h3 className="font-title-md text-body-lg text-on-surface group-hover:text-primary transition-colors line-clamp-1">{video.title}</h3>
      <p className="font-label-caps text-[10px] text-on-surface-variant mt-1 uppercase tracking-wider">{video.fileName}</p>
    </button>
  );
}

function WatchScreen(props) {
  const { video, suggestions, comments, liked, muted, onMuted, onBack, onToggleLike, onAddComment, onSelect, onOpenChannel, onAspect } = props;
  const [draft, setDraft] = useState("");

  return (
    <main className="md:ml-64 pt-24 px-gutter pb-12 bg-background min-h-screen text-on-surface font-body-lg overflow-auto">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 flex flex-col gap-8">
          <div className="relative w-full aspect-video glass-panel rounded-3xl overflow-hidden video-glow group">
            <video
              className="w-full h-full object-contain bg-black"
              src={video.src}
              controls
              autoPlay
              loop
              playsInline
              muted={muted}
              onLoadedMetadata={(event) => onAspect(video.id, event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
            />
          </div>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight uppercase">{video.title}</h1>
              <div className="flex items-center gap-4 text-on-surface-variant font-label-caps text-[11px]">
                <span>LOCAL VIDEO</span>
                <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                <span>{video.fileName}</span>
                <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                <span className="text-secondary">#{video.channel}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-6 border-y border-white/5 py-6">
              <div className="flex items-center gap-4">
                <button className="w-12 h-12 rounded-full overflow-hidden border-2 border-secondary/30 bg-secondary text-on-secondary flex items-center justify-center font-bold" type="button" onClick={() => onOpenChannel(video.channel)}>
                  {video.channel.slice(0, 1).toUpperCase()}
                </button>
                <div>
                  <button className="font-title-md text-title-md text-on-surface flex items-center gap-1 bg-transparent" type="button" onClick={() => onOpenChannel(video.channel)}>
                    {video.channel}
                    <Icon className="text-secondary text-sm" filled>verified</Icon>
                  </button>
                  <p className="text-body-sm text-on-surface-variant font-label-caps">LOCAL CREATOR</p>
                </div>
                <button className="ml-4 px-6 py-2 bg-on-surface text-surface font-bold rounded-full text-body-sm hover:scale-105 transition-transform active:scale-95" type="button" onClick={onBack}>BACK</button>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-5 py-2 rounded-full hover:bg-white/10 transition-colors" type="button" onClick={onToggleLike}>
                  <Icon filled={liked}>thumb_up</Icon>
                  <span className="font-label-caps">{liked ? "SAVED" : "SAVE"}</span>
                </button>
                <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-5 py-2 rounded-full hover:bg-white/10 transition-colors" type="button" onClick={onMuted}>
                  <Icon>{muted ? "volume_off" : "volume_up"}</Icon>
                  <span className="font-label-caps">{muted ? "MUTED" : "SOUND"}</span>
                </button>
                <button className="p-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors" type="button">
                  <Icon>more_horiz</Icon>
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <h2 className="font-title-md text-title-md text-on-surface">{comments.length} COMMENTS</h2>
                <button className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors" type="button">
                  <Icon>sort</Icon>
                  <span className="font-label-caps">SORT BY</span>
                </button>
              </div>
              <form
                className="flex gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  onAddComment(video.id, draft);
                  setDraft("");
                }}
              >
                <div className="w-10 h-10 rounded-full bg-surface-container-high shrink-0 overflow-hidden border border-white/10 flex items-center justify-center text-secondary font-bold">L</div>
                <div className="w-full flex flex-col gap-2">
                  <input className="bg-transparent border-b border-white/10 focus:border-secondary outline-none py-2 text-body-sm w-full transition-colors" placeholder="Add a comment..." value={draft} onChange={(event) => setDraft(event.target.value)} />
                  <div className="flex justify-end gap-3 mt-2">
                    <button className="px-4 py-1.5 text-label-caps text-on-surface-variant hover:text-on-surface transition-colors" type="button" onClick={() => setDraft("")}>CANCEL</button>
                    <button className="px-4 py-1.5 text-label-caps bg-secondary text-on-primary font-bold rounded-lg" type="submit">COMMENT</button>
                  </div>
                </div>
              </form>
              <div className="space-y-8">
                {comments.map((comment) => (
                  <div className="flex gap-4" key={comment.id}>
                    <div className="w-10 h-10 rounded-full bg-surface-container-high shrink-0 overflow-hidden flex items-center justify-center text-secondary font-bold">L</div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-body-sm font-bold text-on-surface">Local Viewer</span>
                        <span className="text-[10px] font-label-caps text-on-surface-variant">LOCAL</span>
                      </div>
                      <p className="text-body-sm text-on-surface-variant leading-relaxed">{comment.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-label-caps text-label-caps text-on-surface tracking-widest">UP NEXT</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-label-caps text-on-surface-variant">AUTOPLAY</span>
              <div className="w-8 h-4 bg-secondary rounded-full relative cursor-pointer">
                <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full"></div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-5">
            {suggestions.map((item) => (
              <button className="flex gap-4 group cursor-pointer bg-transparent text-left" type="button" key={item.id} onClick={() => onSelect(item.id)}>
                <div className="relative w-40 h-24 rounded-xl overflow-hidden shrink-0 border border-white/10 group-hover:border-secondary/50 transition-colors">
                  <video className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" src={item.src} muted playsInline preload="metadata" />
                  <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-label-caps text-white">LOCAL</div>
                </div>
                <div className="flex flex-col gap-1">
                  <h4 className="text-body-sm font-bold text-on-surface line-clamp-2 leading-tight group-hover:text-secondary transition-colors">{item.title}</h4>
                  <p className="text-[11px] font-label-caps text-on-surface-variant">{item.channel}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function NotificationsScreen({ comments, likes, channels }) {
  const commentCount = Object.values(comments).reduce((sum, list) => sum + list.length, 0);
  const likedCount = Object.values(likes).filter(Boolean).length;
  const rows = [
    ["favorite", `${likedCount} saved clips`, "Your saved pulses are stored locally."],
    ["comment", `${commentCount} local comments`, "Comment threads live in this browser only."],
    ["subscriptions", `${channels.length} channels indexed`, "Each folder is a LUMINA creator channel."]
  ];

  return (
    <main className="md:ml-64 pt-16 min-h-screen bg-background text-on-surface">
      <div className="max-w-4xl mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <h1 className="font-headline-lg text-headline-lg text-primary mb-8">Notifications</h1>
        <div className="space-y-4">
          {rows.map(([icon, title, body]) => (
            <article className="glass-panel rounded-2xl p-5 flex items-center gap-4" key={title}>
              <div className="w-12 h-12 rounded-full bg-secondary/10 border border-secondary/30 flex items-center justify-center text-secondary">
                <Icon>{icon}</Icon>
              </div>
              <div>
                <h2 className="font-title-md text-title-md">{title}</h2>
                <p className="text-body-sm text-on-surface-variant">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function SettingsScreen({ videos: allVideos, channels }) {
  return (
    <main className="md:ml-64 pt-16 min-h-screen bg-background text-on-surface">
      <div className="max-w-4xl mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <h1 className="font-headline-lg text-headline-lg text-primary mb-8">Settings</h1>
        <div className="glass-panel rounded-3xl p-8 space-y-6">
          <SettingRow label="Local clips" value={allVideos.length} />
          <SettingRow label="Channels" value={channels.length} />
          <SettingRow label="Authentication" value="Disabled" />
          <SettingRow label="Upload surface" value="Disabled" />
        </div>
      </div>
    </main>
  );
}

function SettingRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-4">
      <span className="font-label-caps text-label-caps text-on-surface-variant">{label}</span>
      <strong className="text-primary">{value}</strong>
    </div>
  );
}

function PremiumScreen() {
  return (
    <main className="md:ml-64 pt-16 min-h-screen bg-background text-on-surface">
      <div className="max-w-5xl mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <section className="glass-panel rounded-3xl p-10">
          <p className="font-label-caps text-label-caps text-secondary mb-3">LUMINA LOCAL</p>
          <h1 className="font-display-lg text-display-lg text-primary mb-4">Premium calm, no account required.</h1>
          <p className="text-on-surface-variant max-w-2xl">This local build keeps the premium LUMINA interface while disabling login, payments, upload, and remote feeds.</p>
        </section>
      </div>
    </main>
  );
}

function UploadScreen() {
  return (
    <main className="md:ml-64 pt-16 min-h-screen bg-background text-on-surface">
      <div className="max-w-4xl mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <section className="glass-panel rounded-3xl p-10 text-center">
          <Icon className="text-secondary text-5xl mb-4">upload</Icon>
          <h1 className="font-headline-lg text-headline-lg text-primary mb-3">Upload is disabled</h1>
          <p className="text-on-surface-variant">Only videos explicitly listed in the local manifest are available.</p>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
