import { useState } from "react";
import { Award, Check, Crown, LockKeyhole, Pencil, Plus, Save, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { DEFAULT_TITLES, getRarityVisual, isTitleUnlocked, normalizeRarity, RARITY_ORDER, SYSTEM_ROLES, TITLE_CATEGORIES } from "../title-catalog";
import { RarityBadge, TitleBadge } from "./TitleBadge";

const XP_LEVEL_SIZE = 1000;
const EDITABLE_CATEGORIES = ["inner-circle", "teacher", "xp", "perks"];
const RARITIES = RARITY_ORDER;

function textInputStyle(t) {
  return {
    width: "100%", minWidth: 0, padding: "9px 10px", borderRadius: 8,
    border: `1px solid ${t.border}`, background: t.surface, color: t.text,
    fontSize: 12.5, outline: "none",
  };
}

function actionButtonStyle(t, primary = false) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "8px 11px", borderRadius: 8,
    border: primary ? "1px solid transparent" : `1px solid ${t.border}`,
    background: primary ? "#FF5E3A" : "transparent",
    color: primary ? "#0D0B14" : t.text,
    fontSize: 11.5, fontWeight: 650, cursor: "pointer", whiteSpace: "nowrap",
  };
}

function SectionHeading({ title, detail, t }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700 }}>{title}</div>
      {detail && <div style={{ color: t.textMuted, fontSize: 11.5, marginTop: 3 }}>{detail}</div>}
    </div>
  );
}

export function ProfileIdentity({ profile, role, title, t, theme = "dark", compact = false, onUpdateName }) {
  const roleInfo = SYSTEM_ROLES.find((entry) => entry.id === role) || SYSTEM_ROLES[0];
  const level = Math.floor((profile.xp || 0) / XP_LEVEL_SIZE) + 1;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name || "Student");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flexWrap: "wrap" }}>
      <div style={{ width: compact ? 34 : 40, height: compact ? 34 : 40, borderRadius: 10, flexShrink: 0, background: t.surfaceRaised, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: roleInfo.color }}>
        {role === "owner" ? <Crown size={compact ? 16 : 18} /> : <UserRound size={compact ? 16 : 18} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 650, color: t.text }}>{profile.name || "Student"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
          {title ? <TitleBadge title={title} ownerGranted={title.ownerGranted} theme={theme} compact /> : <span style={{ color: t.textFaint, fontSize: 11 }}>No title equipped</span>}
          <span style={{ color: t.textMuted, fontSize: 10.5 }}>{roleInfo.label} · {(profile.xp || 0).toLocaleString()} XP · Level {level}</span>
        </div>
        {title?.ownerOnly && title.subtitle && <div style={{ color: t.textMuted, fontSize: 10.5, marginTop: 4 }}>{title.subtitle}</div>}
      </div>
      {onUpdateName && (editingName ? (
        <form onSubmit={(event) => { event.preventDefault(); onUpdateName(nameDraft); setEditingName(false); }} style={{ display: "flex", gap: 5, width: compact ? "100%" : "auto" }}>
          <input aria-label="Profile display name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} style={{ ...textInputStyle(t), width: 130, padding: "6px 8px" }} />
          <button type="submit" aria-label="Save display name" style={{ ...actionButtonStyle(t, true), padding: "5px 7px" }}><Check size={13} /></button>
        </form>
      ) : (
        <button type="button" title="Edit display name" aria-label="Edit display name" onClick={() => { setNameDraft(profile.name || "Student"); setEditingName(true); }} style={{ border: `1px solid ${t.border}`, borderRadius: 7, padding: 6, background: "transparent", color: t.textMuted, cursor: "pointer", display: "flex" }}><Pencil size={13} /></button>
      ))}
    </div>
  );
}

function TitleCard({ title, role, xp, grantedIds, activeTitleId, onEquipTitle, theme, t }) {
  const granted = grantedIds.includes(title.id);
  const unlocked = isTitleUnlocked(title, { role, xp, grantedTitleIds: grantedIds });
  const equipped = activeTitleId === title.id;
  const ownerExclusive = title.ownerOnly || title.category === "owner-exclusive";
  const mayEquip = unlocked && role !== "owner" && !ownerExclusive;
  const detail = title.category === "xp"
    ? unlocked ? `Earned at ${title.xpRequired.toLocaleString()} XP` : `Unlocks at ${title.xpRequired.toLocaleString()} XP`
    : ownerExclusive ? "Exclusive to the StudentOS owner" : unlocked ? granted ? "Granted by the owner" : "Teacher role title" : title.category === "teacher" ? "Assigned to teachers by the owner" : "Granted by the owner";
  const rarity = normalizeRarity(title.rarity);
  const stateLabel = ownerExclusive ? "OWNER EXCLUSIVE" : equipped ? "EQUIPPED" : unlocked ? "UNLOCKED" : "LOCKED";

  return (
    <article
      className={`title-card title-card--${rarity.toLowerCase()}${!unlocked ? " title-card--locked" : ""}${equipped ? " title-card--equipped" : ""}${ownerExclusive ? " title-card--owner" : ""}`}
      style={{ ...getRarityVisual(title, theme), "--card-surface": t.surface, "--text-muted": t.textMuted }}
    >
      <div className="title-card__topline">
        <RarityBadge rarity={rarity} theme={theme} locked={!unlocked} />
        <span className={`title-card__state${equipped ? " title-card__state--equipped" : ""}`}>
          {unlocked ? equipped ? <Check size={11} /> : ownerExclusive ? <Crown size={11} /> : null : <LockKeyhole size={11} />}
          {stateLabel}
        </span>
      </div>
      <TitleBadge title={title} locked={!unlocked} ownerGranted={granted && !ownerExclusive} theme={theme} />
      {title.subtitle && <div className="title-card__subtitle">{title.subtitle}</div>}
      <div className="title-card__description">{title.description}</div>
      <div className="title-card__footer">
        <span className="title-card__requirement">{detail}</span>
        {unlocked && !ownerExclusive && (
          <button
            type="button"
            disabled={!mayEquip || equipped}
            onClick={() => onEquipTitle(title.id)}
            className="title-card__equip"
            style={{ "--rarity-color": getRarityVisual(title, theme)["--rarity-color"] }}
          >
            {equipped ? "Equipped" : "Equip"}
          </button>
        )}
      </div>
    </article>
  );
}

function TitleCollection({ titles, role, xp, grantedIds, activeTitleId, onEquipTitle, theme, t }) {
  return (
    <div className="title-collection" style={{ "--text-muted": t.textMuted }}>
      {RARITY_ORDER.map((rarity) => {
        const rarityTitles = titles.filter((title) => normalizeRarity(title.rarity) === rarity);
        return (
          <section className={`title-rarity-group title-rarity-group--${rarity.toLowerCase()}`} key={rarity} style={getRarityVisual({ rarity }, theme)}>
            <div className="title-rarity-group__heading">
              <div className="title-rarity-group__label">
                <RarityBadge rarity={rarity} theme={theme} />
              </div>
              <span className="title-rarity-group__count">{rarityTitles.length} {rarityTitles.length === 1 ? "title" : "titles"}</span>
            </div>
            <div className="title-card-grid">
              {rarityTitles.map((title) => (
                <TitleCard
                  key={title.id}
                  title={title}
                  role={role}
                  xp={xp}
                  grantedIds={grantedIds}
                  activeTitleId={activeTitleId}
                  onEquipTitle={onEquipTitle}
                  theme={theme}
                  t={t}
                />
              ))}
              {rarityTitles.length === 0 && <div className="title-rarity-group__empty">No titles at this tier yet.</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MemberManager({ titleSystem, titles, onSaveMember, onToggleGrant, theme, t }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("student");
  const [grantTitleId, setGrantTitleId] = useState("");
  const [selectedEmail, setSelectedEmail] = useState("");
  const assignedMember = selectedEmail ? titleSystem.members[selectedEmail] : null;
  const grantableTitles = titles.filter((title) => title.manuallyGranted && !title.ownerOnly && title.category !== "owner-exclusive" && (title.category !== "teacher" || assignedMember?.role === "teacher"));
  const assignedTitles = grantableTitles.filter((title) => assignedMember?.grantedTitleIds?.includes(title.id));
  const memberRows = Object.entries(titleSystem.members || {}).sort(([a], [b]) => a.localeCompare(b));

  function loadMember(memberEmail) {
    const normalized = memberEmail.trim().toLowerCase();
    const member = titleSystem.members[normalized];
    setSelectedEmail(normalized);
    setEmail(normalized);
    setDisplayName(member?.name || "");
    setRole(member?.role === "teacher" || member?.role === "admin" ? member.role : "student");
  }

  function handleSubmit(event) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) return;
    onSaveMember({ email: normalized, name: displayName.trim(), role });
    setSelectedEmail(normalized);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 14, alignItems: "start" }}>
      <div style={{ minWidth: 0 }}>
        <SectionHeading title="Member access" detail="Set student, teacher, or admin. Owner remains fixed to the configured account." t={t} />
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 8, padding: 13, border: `1px solid ${t.border}`, background: t.surface, borderRadius: 10 }}>
          <input aria-label="Member email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" style={textInputStyle(t)} />
          <input aria-label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" style={textInputStyle(t)} />
          <div style={{ display: "flex", gap: 8 }}>
            <select aria-label="Member role" value={role} onChange={(event) => setRole(event.target.value)} style={{ ...textInputStyle(t), flex: 1 }}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" style={actionButtonStyle(t, true)}><Save size={13} /> Save</button>
          </div>
        </form>
        <div style={{ maxHeight: 175, overflowY: "auto", marginTop: 9, borderTop: `1px solid ${t.border}` }}>
          {memberRows.map(([memberEmail, member]) => (
            <button key={memberEmail} type="button" onClick={() => loadMember(memberEmail)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 3px", border: "none", borderBottom: `1px solid ${t.border}`, background: selectedEmail === memberEmail ? t.surfaceRaised : "transparent", color: t.text, textAlign: "left", cursor: "pointer" }}>
              <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 11.5, fontWeight: 600 }}>{member.name || memberEmail}</span><span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", fontSize: 10, color: t.textFaint }}>{memberEmail}</span></span>
              <span style={{ flexShrink: 0, color: t.textMuted, fontSize: 10.5, textTransform: "capitalize" }}>{member.role}</span>
            </button>
          ))}
          {memberRows.length === 0 && <div style={{ padding: 9, color: t.textFaint, fontSize: 11 }}>No managed members yet.</div>}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <SectionHeading title="Owner-granted titles" detail={selectedEmail || "Choose a member to assign titles."} t={t} />
        {selectedEmail && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <select aria-label="Title to grant" value={grantTitleId} onChange={(event) => setGrantTitleId(event.target.value)} style={{ ...textInputStyle(t), flex: 1 }}>
                <option value="">Choose a title</option>
                {grantableTitles.map((title) => <option key={title.id} value={title.id}>{title.name}</option>)}
              </select>
              <button type="button" disabled={!grantTitleId} onClick={() => onToggleGrant(selectedEmail, grantTitleId, true)} style={{ ...actionButtonStyle(t, true), opacity: grantTitleId ? 1 : 0.55 }}><Plus size={13} /> Grant</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 8 }}>
              {assignedTitles.map((title) => (
                <div key={title.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "8px 9px", borderRadius: 8, background: t.surface, border: `1px solid ${t.border}` }}>
                  <TitleBadge title={title} ownerGranted theme={theme} compact />
                  <button type="button" aria-label={`Revoke ${title.name}`} onClick={() => onToggleGrant(selectedEmail, title.id, false)} style={{ border: "none", background: "transparent", color: t.textFaint, cursor: "pointer", display: "flex", padding: 4 }}><Trash2 size={13} /></button>
                </div>
              ))}
              {assignedTitles.length === 0 && <div style={{ color: t.textFaint, fontSize: 11 }}>No special titles assigned.</div>}
            </div>
          </>
        )}
        <div style={{ marginTop: 12, color: t.textFaint, fontSize: 10.5, lineHeight: 1.5 }}>
          Architect is never assignable. Admin does not inherit owner controls.
        </div>
      </div>
    </div>
  );
}

function CatalogManager({ titles, onUpdateTitle, onCreateTitle, onRemoveTitle, t }) {
  const [editingId, setEditingId] = useState("rookie");
  const [editOverrides, setEditOverrides] = useState({});
  const [createValues, setCreateValues] = useState({ name: "", description: "", category: "perks", rarity: "Rare", xpRequired: 100, exclusive: true });
  const editingTitle = titles.find((title) => title.id === editingId);
  const editValues = {
    name: editingTitle?.name || "",
    description: editingTitle?.description || "",
    rarity: editingTitle?.rarity || "Common",
    xpRequired: editingTitle?.xpRequired || 0,
    exclusive: Boolean(editingTitle?.manuallyGranted && editingTitle?.category === "xp"),
    ...editOverrides,
  };

  function handleEdit(event) {
    event.preventDefault();
    if (!editingTitle) return;
    onUpdateTitle(editingId, {
      name: editValues.name.trim(),
      description: editValues.description.trim(),
      rarity: editValues.rarity,
      ...(editingTitle.category === "xp" ? {
        xpRequired: Math.max(0, Number(editValues.xpRequired) || 0),
        manuallyGranted: Boolean(editValues.exclusive),
      } : {}),
    });
  }

  function handleCreate(event) {
    event.preventDefault();
    if (!createValues.name.trim()) return;
    onCreateTitle({
      id: `custom-${Date.now()}`,
      name: createValues.name.trim(),
      description: createValues.description.trim(),
      category: createValues.category,
      rarity: createValues.rarity,
      icon: createValues.category === "teacher" ? "GraduationCap" : "Sparkles",
      xpRequired: createValues.category === "xp" ? Math.max(0, Number(createValues.xpRequired) || 0) : undefined,
      manuallyGranted: createValues.category !== "xp" || Boolean(createValues.exclusive),
      ownerGranted: createValues.category === "inner-circle",
    });
    setCreateValues({ name: "", description: "", category: "perks", rarity: "Rare", xpRequired: 100, exclusive: true });
  }

  const field = (key, value) => setEditOverrides((current) => ({ ...current, [key]: value }));
  const customTitle = editingTitle?.id.startsWith("custom-");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 14, alignItems: "start" }}>
      <div>
        <SectionHeading title="Edit title catalog" detail="Changes are saved for this browser profile." t={t} />
        <form onSubmit={handleEdit} style={{ display: "grid", gap: 8, padding: 13, borderRadius: 10, border: `1px solid ${t.border}`, background: t.surface }}>
          <select aria-label="Title to edit" value={editingId} onChange={(event) => { setEditingId(event.target.value); setEditOverrides({}); }} style={textInputStyle(t)}>
            {titles.map((title) => <option key={title.id} value={title.id}>{title.name}</option>)}
          </select>
          <input aria-label="Title name" value={editValues.name || ""} onChange={(event) => field("name", event.target.value)} style={textInputStyle(t)} />
          <textarea aria-label="Title description" value={editValues.description || ""} onChange={(event) => field("description", event.target.value)} rows={2} style={{ ...textInputStyle(t), resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <select aria-label="Title rarity" value={editValues.rarity || "Common"} disabled={editingTitle?.ownerOnly} onChange={(event) => field("rarity", event.target.value)} style={{ ...textInputStyle(t), flex: 1, opacity: editingTitle?.ownerOnly ? 0.7 : 1 }}>
              {RARITIES.map((rarity) => <option key={rarity}>{rarity}</option>)}
            </select>
            {editingTitle?.category === "xp" && <input aria-label="XP requirement" type="number" min="0" value={editValues.xpRequired ?? 0} onChange={(event) => field("xpRequired", event.target.value)} style={{ ...textInputStyle(t), width: 110 }} />}
          </div>
          {editingTitle && !editingTitle.ownerOnly && (
            <label style={{ display: "flex", alignItems: "center", gap: 7, color: t.textMuted, fontSize: 11.5 }}>
              <input type="checkbox" checked={Boolean(editValues.exclusive)} onChange={(event) => field("exclusive", event.target.checked)} /> Exclusive rarity
            </label>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" style={actionButtonStyle(t, true)}><Save size={13} /> Save changes</button>
            {customTitle && <button type="button" onClick={() => onRemoveTitle(editingId)} style={actionButtonStyle(t)}><Trash2 size={13} /> Remove custom</button>}
          </div>
        </form>
      </div>

      <div>
        <SectionHeading title="Create custom title" detail="Add future categories and achievements without changing the catalog code." t={t} />
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 8, padding: 13, borderRadius: 10, border: `1px solid ${t.border}`, background: t.surface }}>
          <input aria-label="New title name" required value={createValues.name} onChange={(event) => setCreateValues((current) => ({ ...current, name: event.target.value }))} placeholder="Title name" style={textInputStyle(t)} />
          <input aria-label="New title description" value={createValues.description} onChange={(event) => setCreateValues((current) => ({ ...current, description: event.target.value }))} placeholder="Description" style={textInputStyle(t)} />
          <div style={{ display: "flex", gap: 8 }}>
            <select aria-label="New title category" value={createValues.category} onChange={(event) => setCreateValues((current) => ({ ...current, category: event.target.value }))} style={{ ...textInputStyle(t), flex: 1 }}>
              {EDITABLE_CATEGORIES.map((categoryId) => <option key={categoryId} value={categoryId}>{TITLE_CATEGORIES.find((category) => category.id === categoryId)?.label}</option>)}
            </select>
            <select aria-label="New title rarity" value={createValues.rarity} onChange={(event) => setCreateValues((current) => ({ ...current, rarity: event.target.value }))} style={{ ...textInputStyle(t), width: 120 }}>
              {RARITIES.map((rarity) => <option key={rarity}>{rarity}</option>)}
            </select>
          </div>
          {createValues.category === "xp" && <input aria-label="New title XP requirement" type="number" min="0" value={createValues.xpRequired} onChange={(event) => setCreateValues((current) => ({ ...current, xpRequired: event.target.value }))} style={textInputStyle(t)} />}
          <label style={{ display: "flex", alignItems: "center", gap: 7, color: t.textMuted, fontSize: 11.5 }}>
            <input type="checkbox" checked={Boolean(createValues.exclusive)} onChange={(event) => setCreateValues((current) => ({ ...current, exclusive: event.target.checked }))} /> Exclusive / manually granted
          </label>
          <button type="submit" style={{ ...actionButtonStyle(t, true), justifySelf: "start" }}><Plus size={13} /> Create title</button>
        </form>
      </div>
    </div>
  );
}

export function TitlesView({
  profile, role, email, title, titles, titleSystem, isOwner, theme = "dark", t,
  onEquipTitle, onSaveMember, onToggleGrant, onUpdateTitle, onCreateTitle, onRemoveTitle, onUpdateProfileName,
}) {
  const [ownerPanel, setOwnerPanel] = useState("members");
  const [view, setView] = useState("collection");
  const visibleTitles = titles.length ? titles : DEFAULT_TITLES;
  const xpTitles = visibleTitles.filter((item) => item.category === "xp" && !item.manuallyGranted).sort((a, b) => a.xpRequired - b.xpRequired);
  const nextXpTitle = xpTitles.find((item) => item.xpRequired > (profile.xp || 0));
  const previousXpRequirement = xpTitles.filter((item) => item.xpRequired <= (profile.xp || 0)).at(-1)?.xpRequired || 0;
  const xpProgress = nextXpTitle
    ? Math.min(100, Math.max(0, ((profile.xp - previousXpRequirement) / (nextXpTitle.xpRequired - previousXpRequirement)) * 100))
    : 100;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700 }}>Titles & Roles</div>
          <div style={{ color: t.textMuted, fontSize: 12, marginTop: 3 }}>Progress, recognition, and account role.</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: 3, borderRadius: 9, border: `1px solid ${t.border}`, background: t.surface }}>
          <button type="button" onClick={() => setView("collection")} style={{ ...actionButtonStyle(t, view === "collection"), padding: "6px 9px", background: view === "collection" ? t.surfaceRaised : "transparent", color: t.text }}>Collection</button>
          {isOwner && <button type="button" onClick={() => setView("manage")} style={{ ...actionButtonStyle(t, view === "manage"), padding: "6px 9px", background: view === "manage" ? t.surfaceRaised : "transparent", color: t.text }}><ShieldCheck size={12} /> Owner tools</button>}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: 12, border: `1px solid ${t.border}`, borderRadius: 10, background: t.surface }}>
        <ProfileIdentity profile={profile} role={role} title={title} t={t} theme={theme} onUpdateName={onUpdateProfileName} />
        <div style={{ minWidth: 145 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: t.textMuted, fontSize: 10.5, marginBottom: 5 }}><span>{nextXpTitle ? `Next: ${nextXpTitle.name}` : "XP titles complete"}</span><span>{nextXpTitle ? `${nextXpTitle.xpRequired.toLocaleString()} XP` : ""}</span></div>
          <div style={{ height: 5, borderRadius: 5, overflow: "hidden", background: t.border }}><div style={{ width: `${xpProgress}%`, height: "100%", background: nextXpTitle ? getRarityVisual(nextXpTitle, theme)["--rarity-color"] : "#FF5E3A", transition: "width 300ms ease" }} /></div>
        </div>
      </div>

      {view === "collection" ? (
        <TitleCollection
          titles={visibleTitles}
          role={role}
          xp={profile.xp || 0}
          grantedIds={titleSystem.members[email]?.grantedTitleIds || []}
          activeTitleId={title?.id}
          onEquipTitle={onEquipTitle}
          theme={theme}
          t={t}
        />
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "14px 0 12px", padding: 3, borderRadius: 9, width: "fit-content", maxWidth: "100%", border: `1px solid ${t.border}`, background: t.surface }}>
            {[{ id: "members", label: "Members", icon: Users }, { id: "catalog", label: "Title catalog", icon: Award }].map((tab) => {
              const Icon = tab.icon;
              const active = ownerPanel === tab.id;
              return <button key={tab.id} type="button" onClick={() => setOwnerPanel(tab.id)} style={{ ...actionButtonStyle(t, active), padding: "6px 9px", background: active ? t.surfaceRaised : "transparent", color: t.text }}><Icon size={12} /> {tab.label}</button>;
            })}
          </div>
          <div style={{ padding: 13, border: `1px solid ${t.border}`, borderRadius: 10, background: t.surface }}>
            {ownerPanel === "members" ? (
              <MemberManager titleSystem={titleSystem} titles={visibleTitles} onSaveMember={onSaveMember} onToggleGrant={onToggleGrant} theme={theme} t={t} />
            ) : (
              <CatalogManager titles={visibleTitles} onUpdateTitle={onUpdateTitle} onCreateTitle={onCreateTitle} onRemoveTitle={onRemoveTitle} t={t} />
            )}
          </div>
        </>
      )}
    </div>
  );
}