<script>
  import { onMount } from 'svelte';
  import {
    AlertTriangle,
    BatteryCharging,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronRight,
    CircleGauge,
    CloudSun,
    Database,
    Download,
    Droplets,
    File,
    FileJson,
    Flame,
    Folder,
    Gauge,
    HardDrive,
    LayoutDashboard,
    MapPin,
    Navigation,
    PanelLeft,
    Radio,
    RefreshCw,
    Route,
    Save,
    Settings,
    ShieldCheck,
    Signal,
    Sun,
    Sunset,
    Thermometer,
    Trash2,
    Wifi,
    WifiOff,
    X
  } from '@lucide/svelte';
  import {
    DEFAULT_DATA_SOURCE,
    fetchDeviceSnapshot,
    loadDataSourceConfig,
    saveDataSourceConfig
  } from './lib/deviceDataSource.js';
  import {
    buildStorageFileUrl,
    deleteStorageFile,
    fetchStorageSnapshot,
    formatBytes
  } from './lib/storageDataSource.js';

  let activeView = 'overview';
  let pumpOn = true;
  let heaterOn = true;
  let alertExpanded = false;
  let lastUpdated = 'Not connected';
  let sourceConfig = { ...DEFAULT_DATA_SOURCE };
  let sourceDraft = { ...DEFAULT_DATA_SOURCE };
  let sourceState = 'unconfigured';
  let sourceMessage = 'Add a device address to begin receiving live data.';
  let settingsMessage = '';
  let settingsSection = 'data-source';
  let storageSnapshot = null;
  let storageState = 'idle';
  let storageMessage = 'Open Advanced to read storage information from the device.';
  let selectedStoragePath = '';
  let snapshot = null;
  let refreshTimer;
  let refreshRequest = 0;
  let refreshing = false;

  let checks = [
    { id: 1, label: 'Slides & awning', value: 'In', done: true },
    { id: 2, label: 'Shore power', value: 'Disconnected', done: true },
    { id: 3, label: 'Tire pressure', value: 'Normal', done: true },
    { id: 4, label: 'Gray tank', value: '87%', done: false, attention: true }
  ];

  const events = [
    { time: '10:30', title: 'Depart for Moab', detail: '2 hr 35 min · 128 mi', icon: Navigation },
    { time: '12:15', title: 'Fuel stop', detail: 'Green River · 25 min', icon: MapPin },
    { time: '1:30', title: 'Arrive & check in', detail: 'Site B14 · confirmation saved', icon: CheckCircle2 }
  ];

  const sampleTankSystems = [
    { label: 'Fresh', value: '67%', context: '≈ 5 days', tone: 'good', gauge: 67 },
    { label: 'Gray', value: '87%', context: '≈ 1 day', tone: 'attention', gauge: 87 },
    { label: 'Black', value: '5%', context: '12+ days', tone: 'neutral', gauge: 5 }
  ];

  const coachSystems = [
    { label: 'Battery', value: '90%', context: '18 hr', tone: 'good', gauge: 90 },
    { label: 'LP', value: '67%', context: '≈ 14 days', tone: 'good', gauge: 67 },
    { label: 'Solar', value: '121 W', context: 'Net +74 W', tone: 'good', gauge: 61 }
  ];

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'today', label: 'Today', icon: CalendarDays },
    { id: 'systems', label: 'Systems', icon: Gauge },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  $: tankSystems = buildTankMetrics(snapshot?.tank, snapshot?.tankConfig);
  $: visibleTankSystems = tankSystems.length ? tankSystems : sampleTankSystems;
  $: systems = [...visibleTankSystems.slice(0, 3), ...coachSystems];
  $: graySystem = visibleTankSystems.find((system) => system.type === 'gray' || system.label.toLowerCase().includes('gray'));
  $: activeTankAlert = buildTankAlert(snapshot, visibleTankSystems);
  $: selectedStorageEntry = storageSnapshot?.files.find((entry) => entry.path === selectedStoragePath) ?? null;
  $: storageUsedPercent = storageSnapshot?.stats?.total_bytes > 0
    ? Math.min(100, (storageSnapshot.stats.used_bytes / storageSnapshot.stats.total_bytes) * 100)
    : 0;
  $: interiorTemperature = Number.isFinite(snapshot?.status?.temp_f) && snapshot.status.aht_valid
    ? `${formatNumber(snapshot.status.temp_f, 1)}°F`
    : '71°F';
  $: liveCurrent = Number.isFinite(snapshot?.status?.current_a)
    ? `${formatNumber(snapshot.status.current_a, 1)} A`
    : null;

  onMount(() => {
    sourceConfig = loadDataSourceConfig();
    sourceDraft = { ...sourceConfig };

    if (sourceConfig.baseUrl) {
      refreshData();
    }

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshRequest += 1;
    };
  });

  function formatNumber(value, digits = 0) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
  }

  function formatUpdatedAt(date) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  }

  function buildTankMetrics(tank, tankConfig) {
    if (!Array.isArray(tank?.sensors)) return [];

    return tank.sensors.map((sensor) => {
      const config = tankConfig?.sensors?.find((item) => item.id === sensor.id);
      const reading = sensor.reading ?? {};
      const valid = Boolean(reading.valid) && Number.isFinite(Number(reading.percent));
      const percent = valid ? Math.min(100, Math.max(0, Number(reading.percent))) : 0;
      const type = String(sensor.type || config?.type || 'custom').toLowerCase();
      const highThreshold = Number(config?.thresholds?.high_percent ?? 85);
      const lowThreshold = Number(config?.thresholds?.low_percent ?? 15);
      const isWaste = type === 'gray' || type === 'black';
      const attention = !valid || (isWaste ? percent >= highThreshold : percent <= lowThreshold);
      const volume = Number(reading.volume_gallons);

      return {
        id: sensor.id,
        type,
        label: sensor.custom_name || config?.custom_name || `${type[0]?.toUpperCase() || ''}${type.slice(1)}` || 'Tank',
        value: valid ? `${formatNumber(percent)}%` : '—',
        context: valid && Number.isFinite(volume)
          ? `${formatNumber(volume, 1)} gal · Live`
          : valid ? 'Live device' : `${sensor.status || 'Unavailable'}`,
        detail: valid && Number.isFinite(volume)
          ? `${formatNumber(volume, 1)} gallons reported by the device`
          : `Sensor status: ${sensor.status || 'unknown'}`,
        tone: attention ? 'attention' : 'good',
        gauge: percent,
        percent,
        valid,
        isWaste,
        highThreshold
      };
    });
  }

  function buildTankAlert(currentSnapshot, metrics) {
    if (!currentSnapshot) {
      return {
        title: 'Gray Tank Is 87% Full',
        summary: 'Dump before departure to avoid reaching capacity tomorrow.',
        details: ['Estimated capacity: 42 gal', 'Current trend: +8% per day', 'Nearest station: 4.2 mi']
      };
    }

    const unavailable = metrics.find((metric) => !metric.valid);
    if (unavailable) {
      return {
        title: `${unavailable.label} Is Unavailable`,
        summary: 'The device reported an invalid tank reading. Check the sensor before travel.',
        details: [unavailable.detail, `Source: ${sourceConfig.baseUrl}`]
      };
    }

    const highWasteTank = metrics.find((metric) => metric.isWaste && metric.percent >= metric.highThreshold);
    if (!highWasteTank) return null;

    return {
      title: `${highWasteTank.label} Is ${highWasteTank.value} Full`,
      summary: 'Dump before departure to avoid reaching capacity.',
      details: [highWasteTank.detail, `Alert threshold: ${formatNumber(highWasteTank.highThreshold)}%`]
    };
  }

  function scheduleRefresh() {
    if (refreshTimer) window.clearTimeout(refreshTimer);
    if (!sourceConfig.baseUrl) return;
    refreshTimer = window.setTimeout(refreshData, sourceConfig.refreshIntervalSeconds * 1000);
  }

  async function refreshData() {
    if (!sourceConfig.baseUrl) {
      activeView = 'settings';
      sourceState = 'unconfigured';
      sourceMessage = 'Add a device address to begin receiving live data.';
      return;
    }

    if (refreshTimer) window.clearTimeout(refreshTimer);
    const requestId = ++refreshRequest;
    refreshing = true;
    if (!snapshot) sourceState = 'connecting';
    sourceMessage = `Reading ${sourceConfig.baseUrl}`;

    try {
      const nextSnapshot = await fetchDeviceSnapshot(sourceConfig);
      if (requestId !== refreshRequest) return;
      snapshot = nextSnapshot;
      sourceState = 'online';
      lastUpdated = formatUpdatedAt(nextSnapshot.receivedAt);
      sourceMessage = `Connected to ${sourceConfig.baseUrl}`;
    } catch (error) {
      if (requestId !== refreshRequest) return;
      sourceState = 'offline';
      const reason = error?.name === 'AbortError' ? 'Connection timed out' : error?.message || 'Connection failed';
      sourceMessage = `${reason}. Confirm the device is reachable from this browser.`;
    } finally {
      if (requestId === refreshRequest) {
        refreshing = false;
        scheduleRefresh();
      }
    }
  }

  function saveSource() {
    settingsMessage = '';
    try {
      sourceConfig = saveDataSourceConfig(sourceDraft);
      sourceDraft = { ...sourceConfig };
      snapshot = null;
      lastUpdated = 'Not connected';
      settingsMessage = sourceConfig.baseUrl ? 'Data source saved. Connecting…' : 'Live data disabled; showing sample values.';
      if (sourceConfig.baseUrl) refreshData();
      else {
        refreshRequest += 1;
        if (refreshTimer) window.clearTimeout(refreshTimer);
        refreshing = false;
        sourceState = 'unconfigured';
        sourceMessage = 'Add a device address to begin receiving live data.';
      }
    } catch (error) {
      settingsMessage = error?.message || 'Enter a valid device address.';
    }
  }

  function storageEntryDepth(entry) {
    return Math.max(0, String(entry?.path ?? '').split('/').filter(Boolean).length - 1);
  }

  async function selectSettingsSection(section) {
    settingsSection = section;
    if (section === 'advanced') await refreshStorage();
  }

  async function refreshStorage() {
    if (!sourceConfig.baseUrl) {
      storageState = 'unconfigured';
      storageMessage = 'Configure a device address under Data Source first.';
      storageSnapshot = null;
      return;
    }

    storageState = 'loading';
    storageMessage = `Reading storage from ${sourceConfig.baseUrl}`;
    try {
      storageSnapshot = await fetchStorageSnapshot(sourceConfig);
      storageState = 'ready';
      storageMessage = storageSnapshot.truncated
        ? 'Showing the first 128 filesystem entries.'
        : `${storageSnapshot.files.length} filesystem entries found.`;
      if (!storageSnapshot.files.some((entry) => entry.path === selectedStoragePath)) {
        selectedStoragePath = '';
      }
    } catch (error) {
      storageState = 'error';
      storageMessage = error?.name === 'AbortError' ? 'Storage request timed out.' : error?.message || 'Unable to read storage.';
    }
  }

  async function removeSelectedStorageFile() {
    if (!selectedStorageEntry?.deletable) return;
    if (!window.confirm(`Delete ${selectedStorageEntry.path}? This cannot be undone.`)) return;

    storageState = 'loading';
    storageMessage = `Deleting ${selectedStorageEntry.path}…`;
    try {
      await deleteStorageFile(sourceConfig, selectedStorageEntry.path);
      selectedStoragePath = '';
      await refreshStorage();
    } catch (error) {
      storageState = 'error';
      storageMessage = error?.name === 'AbortError' ? 'Delete request timed out.' : error?.message || 'Unable to delete file.';
    }
  }

  function toggleCheck(id) {
    checks = checks.map((item) => item.id === id ? { ...item, done: !item.done } : item);
  }
</script>

<svelte:head>
  <title>Coach Overseer</title>
  <meta name="description" content="A day-at-a-glance coach operations dashboard." />
</svelte:head>

<div class="app-shell">
  <aside class="sidebar" aria-label="Primary navigation">
    <div class="brand-mark" aria-label="Coach Overseer"><PanelLeft size={20} strokeWidth={2.2} /></div>
    <nav>
      {#each navItems as item}
        <button
          class:active={activeView === item.id}
          aria-current={activeView === item.id ? 'page' : undefined}
          on:click={() => activeView = item.id}
        >
          <svelte:component this={item.icon} size={20} />
          <span>{item.label}</span>
        </button>
      {/each}
    </nav>
    <div class="sidebar-status" aria-label={`Device data source: ${sourceState}`}>
      <span class:online={sourceState === 'online'} class:connecting={sourceState === 'connecting'} class="status-dot"></span>
      {#if sourceState === 'offline'}<WifiOff size={18} />{:else}<Wifi size={18} />{/if}
      <span>{sourceState === 'unconfigured' ? 'Sample' : sourceState}</span>
    </div>
  </aside>

  <main>
    <header class="topbar">
      <div class="topbar-title">
        <span class="mobile-kicker">Coach Overseer</span>
        <strong>{navItems.find((item) => item.id === activeView)?.label}</strong>
      </div>
      <div class="topbar-meta">
        <span><Radio size={15} /> {sourceState === 'online' ? `Updated ${lastUpdated}` : sourceState === 'unconfigured' ? 'Sample data' : sourceState}</span>
        <button class:refreshing class="icon-button" aria-label="Refresh coach data" disabled={refreshing} on:click={refreshData}><RefreshCw size={18} /></button>
        <div class="avatar" aria-label="Justin's profile">J</div>
      </div>
    </header>

    {#if activeView === 'overview'}
      <div class="page overview-page">
        <section class="day-heading">
          <div>
            <p class="eyebrow">Monday · June 9</p>
            <h1>Good Morning, Justin</h1>
            <p>Your next move is at 10:30 AM.</p>
          </div>
          <div class="weather-summary" aria-label="Today's weather">
            <CloudSun size={24} />
            <div><strong>72°</strong><span>Clear · High 82°</span></div>
            <div class="weather-divider"></div>
            <Sunset size={20} />
            <div><strong>8:42 PM</strong><span>Sunset</span></div>
          </div>
        </section>

        {#if activeTankAlert}
          <section class="alert-card" aria-label="Action needed">
            <div class="alert-icon"><AlertTriangle size={22} /></div>
            <div class="alert-copy">
              <p class="eyebrow">One Item Before Travel</p>
              <h2>{activeTankAlert.title}</h2>
              <p>{activeTankAlert.summary}</p>
              {#if alertExpanded}
                <div class="alert-details">
                  {#each activeTankAlert.details as detail}<span>{detail}</span>{/each}
                </div>
              {/if}
            </div>
            <button class="text-button" on:click={() => alertExpanded = !alertExpanded}>
              {alertExpanded ? 'Hide details' : 'Review'} <ChevronRight class={alertExpanded ? 'rotated' : ''} size={17} />
            </button>
          </section>
        {/if}

        <div class="overview-grid">
          <section class="content-panel today-panel">
            <div class="section-title">
              <div><p class="eyebrow">Day Plan</p><h2>Today</h2></div>
              <button class="text-button" on:click={() => activeView = 'today'}>Full timeline <ChevronRight size={16} /></button>
            </div>
            <div class="event-list">
              {#each events as event, index}
                <article class:next-event={index === 0} class="event-row">
                  <time>{event.time}</time>
                  <div class="event-line" aria-hidden="true"><span></span></div>
                  <div class="event-icon"><svelte:component this={event.icon} size={17} /></div>
                  <div class="event-copy"><strong>{event.title}</strong><span>{event.detail}</span></div>
                </article>
              {/each}
            </div>
          </section>

          <section class="content-panel checklist-panel">
            <div class="section-title">
              <div><p class="eyebrow">Trip Readiness</p><h2>7 of 8 Ready</h2></div>
              <span class="readiness-ring">88%</span>
            </div>
            <div class="check-list">
              {#each checks as check}
                <button class:attention={check.attention && !check.done} on:click={() => toggleCheck(check.id)}>
                  <span class="check-icon" class:checked={check.done}>
                    {#if check.done}<Check size={14} />{:else}<X size={13} />{/if}
                  </span>
                  <span>{check.label}</span>
                  <strong>{check.label === 'Gray tank' && graySystem ? graySystem.value : check.value}</strong>
                </button>
              {/each}
            </div>
          </section>
        </div>

        <section class="systems-panel">
          <div class="section-title">
            <div><p class="eyebrow">Live Status</p><h2>Systems</h2></div>
            <button class="text-button" on:click={() => activeView = 'systems'}>All systems <ChevronRight size={16} /></button>
          </div>
          <div class="system-metrics">
            {#each systems as system}
              <article class:attention={system.tone === 'attention'} aria-label={`${system.label}: ${system.value}, ${system.context}`}>
                <div class="metric-top"><span>{system.label}</span><span class="mini-status"></span></div>
                <div class="speed-dial" style={`--sweep: ${system.gauge * 2.7}deg`} aria-hidden="true">
                  <div class="dial-reading"><strong>{system.value}</strong></div>
                </div>
                <small>{system.context}</small>
              </article>
            {/each}
          </div>
        </section>

        <section class="content-panel preview-panel" aria-label="Dashboard screenshots">
          <div class="section-title">
            <div><p class="eyebrow">Preview</p><h2>Dashboard Views</h2></div>
            <span>Included screenshots</span>
          </div>
          <div class="preview-grid">
            <article class="preview-card">
              <img src="/Docs/images/Dashboard-Home.png" alt="Coach Overseer home dashboard" />
              <div>
                <strong>Home screen</strong>
                <p>Overview of the day plan, trip readiness, and live systems.</p>
              </div>
            </article>
            <article class="preview-card">
              <img src="/Docs/images/Dashboard System Page.png" alt="Coach Overseer systems dashboard" />
              <div>
                <strong>Systems view</strong>
                <p>Water, waste, power, and connectivity details in one place.</p>
              </div>
            </article>
            <article class="preview-card">
              <img src="/Docs/images/Dashboard_Day-Cal.png" alt="Coach Overseer travel day calendar" />
              <div>
                <strong>Travel timeline</strong>
                <p>Scheduled stops, route progress, and upcoming events.</p>
              </div>
            </article>
            <article class="preview-card">
              <img src="/Docs/images/Dashboard_Configure.png" alt="Coach Overseer configuration view" />
              <div>
                <strong>Configuration</strong>
                <p>Connect the dashboard to a live device monitor source.</p>
              </div>
            </article>
          </div>
        </section>
      </div>

    {:else if activeView === 'today'}
      <div class="page today-page">
        <section class="day-heading">
          <div><p class="eyebrow">Monday · June 9</p><h1>Travel Day to Moab</h1><p>Everything you need between now and camp.</p></div>
          <div class="countdown"><span>DEPART IN</span><strong>1 hr 18 min</strong></div>
        </section>

        <section class="route-card">
          <div><Route size={20} /><span>ROUTE</span><strong>Grand Junction → Moab</strong></div>
          <div><Navigation size={20} /><span>DRIVE</span><strong>128 mi · 2:35</strong></div>
          <div><MapPin size={20} /><span>ARRIVAL</span><strong>1:30 PM</strong></div>
          <div><CloudSun size={20} /><span>WEATHER</span><strong>82° · Clear</strong></div>
        </section>

        <section class="timeline-card">
          <div class="section-title"><div><p class="eyebrow">Schedule</p><h2>Day Timeline</h2></div><span>Local time</span></div>
          <div class="full-timeline">
            <article class="past"><time>8:00</time><span class="timeline-dot"></span><div><strong>Breakfast & pack</strong><p>Complete</p></div></article>
            <article class="current"><time>9:12</time><span class="timeline-dot"></span><div><strong>Now · Departure prep</strong><p>Gray tank needs attention</p></div></article>
            <article><time>10:30</time><span class="timeline-dot"></span><div><strong>Depart</strong><p>I-70 W → US-191 S · moderate winds</p></div></article>
            <article><time>12:15</time><span class="timeline-dot"></span><div><strong>Fuel stop · Green River</strong><p>Diesel available · 25 minutes planned</p></div></article>
            <article><time>1:30</time><span class="timeline-dot"></span><div><strong>Campground check-in</strong><p>Site B14 · hookups confirmed</p></div></article>
            <article><time>8:42</time><span class="timeline-dot"></span><div><strong>Sunset</strong><p>Clear · overnight low 58°</p></div></article>
          </div>
        </section>
      </div>

    {:else if activeView === 'systems'}
      <div class="page systems-page">
        <section class="day-heading">
          <div>
            <p class="eyebrow">Coach Status · {sourceState === 'online' ? lastUpdated : 'Sample data'}</p>
            <h1>{sourceState === 'offline' ? 'Device Data Is Offline' : activeTankAlert ? 'One System Needs Attention' : 'All Critical Systems Online'}</h1>
            <p>{sourceState === 'online' ? sourceMessage : sourceState === 'offline' ? sourceMessage : 'Connect a device in Settings to replace sample values.'}</p>
          </div>
          <div class="location-chip"><MapPin size={17} /> Grand Junction, CO</div>
        </section>

        {#if activeTankAlert}
          <section class="alert-card compact-alert">
            <div class="alert-icon"><AlertTriangle size={22} /></div>
            <div class="alert-copy"><p class="eyebrow">Action Recommended</p><h2>{activeTankAlert.title}</h2><p>{activeTankAlert.summary}</p></div>
            <button class="primary-button" on:click={() => activeView = 'settings'}>Data source</button>
          </section>
        {/if}

        <div class="systems-grid">
          <section class="system-group">
            <div class="section-title"><div><p class="eyebrow">Capacity</p><h2>Water & Waste</h2></div><Droplets size={22} /></div>
            {#each visibleTankSystems as tankSystem}
              <div class:attention={tankSystem.tone === 'attention'} class="bar-metric">
                <div><span>{tankSystem.label}</span><strong>{tankSystem.value}</strong></div>
                <div class="progress"><i style={`width:${tankSystem.gauge}%`}></i></div>
                <small>{tankSystem.context}</small>
              </div>
            {/each}
          </section>

          <section class="system-group power-group">
            <div class="section-title"><div><p class="eyebrow">Energy</p><h2>Power & Fuel</h2></div><BatteryCharging size={22} /></div>
            <div class="power-stats">
              <div><span>BATTERY</span><strong>90%</strong><small>18 hr at current load</small></div>
              <div><span>{liveCurrent ? 'DC CURRENT' : 'SOLAR'}</span><strong>{liveCurrent || '121 W'}</strong><small>{liveCurrent ? 'Live device reading' : 'Net +74 W'}</small></div>
              <div class="lp-stat"><span>LP FUEL</span><strong>67%</strong><small>≈ 14 days remaining</small><div class="lp-meter" aria-hidden="true"><i style="width:67%"></i></div></div>
            </div>
            <div class="sparkline" aria-label="Battery has increased from 84 to 90 percent over twelve hours">
              <span class="spark-segment s1"></span><span class="spark-segment s2"></span><span class="spark-segment s3"></span><span class="spark-segment s4"></span><span class="spark-segment s5"></span><span class="spark-segment s6"></span><span class="spark-segment s7"></span><span class="spark-segment s8"></span><span class="spark-segment s9"></span><span class="spark-segment s10"></span>
            </div>
            <div class="spark-label"><span>12 hours ago</span><span>Now</span></div>
          </section>

          <section class="system-group">
            <div class="section-title"><div><p class="eyebrow">Environment</p><h2>Comfort & Safety</h2></div><ShieldCheck size={22} /></div>
            <div class="detail-row"><span><Thermometer size={18} /> Interior</span><strong>{interiorTemperature}</strong></div>
            <div class="detail-row"><span><Sun size={18} /> Indoor air</span><strong>Good</strong></div>
            <div class="detail-row"><span><ShieldCheck size={18} /> Doors & bays</span><strong>Secure</strong></div>
          </section>

          <section class="system-group">
            <div class="section-title"><div><p class="eyebrow">Network</p><h2>Connectivity</h2></div><Signal size={22} /></div>
            <div class="detail-row"><span><Wifi size={18} /> Primary internet</span><strong>Starlink</strong></div>
            <div class="detail-row"><span><Signal size={18} /> Backup cellular</span><strong>4 bars</strong></div>
            <div class="detail-row"><span><Radio size={18} /> Device source</span><strong>{sourceState}</strong></div>
          </section>
        </div>
      </div>

    {:else}
      <div class="page settings-page">
        <div class="settings-layout">
          <aside class="settings-menu system-group" aria-label="Settings sections">
            <p class="eyebrow">Settings</p>
            <button class:active={settingsSection === 'data-source'} on:click={() => selectSettingsSection('data-source')}>
              <Database size={18} /><span><strong>Data Source</strong><small>Device connection</small></span><ChevronRight size={16} />
            </button>
            <button class:active={settingsSection === 'advanced'} on:click={() => selectSettingsSection('advanced')}>
              <HardDrive size={18} /><span><strong>Advanced</strong><small>Logs and files</small></span><ChevronRight size={16} />
            </button>
          </aside>

          <div class="settings-content">
            {#if settingsSection === 'data-source'}
              <section class="day-heading">
                <div><p class="eyebrow">Dashboard Configuration</p><h1>Data Source</h1><p>Connect Coach Overseer to the Nomad Device Monitor already on your network.</p></div>
                <div class:online={sourceState === 'online'} class:offline={sourceState === 'offline'} class="source-state">
                  {#if sourceState === 'offline'}<WifiOff size={17} />{:else}<Database size={17} />{/if}
                  {sourceState === 'unconfigured' ? 'Not configured' : sourceState}
                </div>
              </section>

              <div class="settings-grid">
                <section class="system-group source-card">
                  <div class="section-title"><div><p class="eyebrow">Nomad Device Monitor</p><h2>Connection</h2></div><Database size={22} /></div>
                  <form on:submit|preventDefault={saveSource}>
                    <label for="source-url">Device address</label>
                    <input id="source-url" type="url" placeholder="http://tankman.local" bind:value={sourceDraft.baseUrl} />
                    <small>Enter the device origin only. The dashboard uses its existing status and tank API endpoints.</small>

                    <label for="refresh-interval">Refresh interval</label>
                    <select id="refresh-interval" bind:value={sourceDraft.refreshIntervalSeconds}>
                      <option value={5}>5 seconds</option>
                      <option value={15}>15 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={60}>1 minute</option>
                      <option value={300}>5 minutes</option>
                    </select>

                    <div class="form-actions">
                      <button class="primary-button" type="submit"><Save size={16} /> Save & connect</button>
                      <button class="secondary-button" type="button" disabled={!sourceConfig.baseUrl || refreshing} on:click={refreshData}>
                        <RefreshCw size={16} /> Refresh now
                      </button>
                    </div>
                    {#if settingsMessage}<p class="form-message">{settingsMessage}</p>{/if}
                  </form>
                </section>

                <section class="system-group source-summary">
                  <div class="section-title"><div><p class="eyebrow">Connection Status</p><h2>{sourceState === 'online' ? 'Receiving live data' : sourceState === 'offline' ? 'Device unavailable' : 'Using sample data'}</h2></div></div>
                  <p>{sourceMessage}</p>
                  <div class="detail-row"><span>Device</span><strong>{sourceConfig.baseUrl || 'Not set'}</strong></div>
                  <div class="detail-row"><span>Refresh cadence</span><strong>{sourceConfig.refreshIntervalSeconds} sec</strong></div>
                  <div class="detail-row"><span>Last update</span><strong>{lastUpdated}</strong></div>
                  <p class="source-note">If this dashboard is opened over HTTPS, use an HTTPS-accessible device endpoint. Browsers block insecure device requests from secure pages.</p>
                </section>
              </div>
            {:else}
              <section class="day-heading">
                <div><p class="eyebrow">Advanced Remote Management</p><h1>Log &amp; File Management</h1><p>Review device storage and download or remove files from the local filesystem.</p></div>
                <button class:refreshing={storageState === 'loading'} class="secondary-button storage-refresh" disabled={storageState === 'loading'} on:click={refreshStorage}>
                  <RefreshCw size={16} /> Refresh
                </button>
              </section>

              <section class="storage-stats" aria-label="Filesystem usage">
                <article><span>Total</span><strong>{formatBytes(storageSnapshot?.stats?.total_bytes)}</strong></article>
                <article><span>Used</span><strong>{formatBytes(storageSnapshot?.stats?.used_bytes)}</strong></article>
                <article><span>Available</span><strong>{formatBytes(storageSnapshot?.stats?.free_bytes)}</strong></article>
                <article class="storage-meter-card">
                  <span>Utilization</span><strong>{storageSnapshot ? `${storageUsedPercent.toFixed(1)}%` : '—'}</strong>
                  <div class="storage-meter"><i style={`width: ${storageUsedPercent}%`}></i></div>
                </article>
              </section>

              <div class="file-management-grid">
                <section class="system-group file-tree-panel">
                  <div class="section-title"><div><p class="eyebrow">File Picker</p><h2>Local filesystem</h2></div><Folder size={22} /></div>
                  <p class:error={storageState === 'error'} class="storage-message">{storageMessage}</p>
                  <div class="file-tree" role="tree" aria-label="Device files">
                    {#if storageSnapshot?.files.length}
                      {#each storageSnapshot.files as entry}
                        <button
                          class:active={selectedStoragePath === entry.path}
                          class:directory={entry.type === 'directory'}
                          role="treeitem"
                          aria-selected={selectedStoragePath === entry.path}
                          style={`--tree-depth: ${storageEntryDepth(entry)}`}
                          on:click={() => selectedStoragePath = entry.path}
                        >
                          {#if entry.type === 'directory'}
                            <Folder size={17} />
                          {:else if entry.name.endsWith('.json')}
                            <FileJson size={17} />
                          {:else}
                            <File size={17} />
                          {/if}
                          <span><strong>{entry.name}</strong><small>{entry.type === 'directory' ? entry.path : formatBytes(entry.size_bytes)}</small></span>
                          {#if entry.protected}<em>Protected</em>{/if}
                        </button>
                      {/each}
                    {:else if storageState !== 'loading'}
                      <div class="file-tree-empty"><Folder size={24} /><span>No files found.</span></div>
                    {/if}
                  </div>
                </section>

                <section class="system-group file-actions-panel">
                  <div class="section-title"><div><p class="eyebrow">Selection</p><h2>{selectedStorageEntry?.name || 'Choose a file'}</h2></div></div>
                  {#if selectedStorageEntry}
                    <div class="detail-row"><span>Path</span><strong>{selectedStorageEntry.path}</strong></div>
                    <div class="detail-row"><span>Type</span><strong>{selectedStorageEntry.type}</strong></div>
                    <div class="detail-row"><span>Size</span><strong>{formatBytes(selectedStorageEntry.size_bytes)}</strong></div>
                    <div class="file-actions">
                      {#if selectedStorageEntry.downloadable}
                        <a class="primary-button" href={buildStorageFileUrl(sourceConfig, selectedStorageEntry.path)}><Download size={16} /> Download</a>
                      {/if}
                      <button class="danger-button" disabled={!selectedStorageEntry.deletable || storageState === 'loading'} on:click={removeSelectedStorageFile}>
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                    {#if selectedStorageEntry.protected}<p class="source-note">This device configuration file is download-only.</p>{/if}
                    {#if selectedStorageEntry.type === 'directory'}<p class="source-note">Select a file inside this directory to manage it.</p>{/if}
                  {:else}
                    <div class="file-selection-empty"><File size={28} /><p>Select a file from the tree to see its details and available actions.</p></div>
                  {/if}
                </section>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <footer class="control-dock" aria-label="Coach controls">
      <button class:enabled={pumpOn} aria-pressed={pumpOn} on:click={() => pumpOn = !pumpOn}>
        <Droplets size={18} /><span>Water pump</span><strong>{pumpOn ? 'On' : 'Off'}</strong>
      </button>
      <button class:enabled={heaterOn} aria-pressed={heaterOn} on:click={() => heaterOn = !heaterOn}>
        <Flame size={18} /><span>Water heater</span><strong>{heaterOn ? 'On' : 'Off'}</strong>
      </button>
      <button on:click={() => activeView = 'systems'}>
        <CircleGauge size={18} /><span>System details</span><ChevronRight size={16} />
      </button>
    </footer>
  </main>
</div>
