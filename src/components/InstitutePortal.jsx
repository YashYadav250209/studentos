import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Building2, Check, ChevronRight, Pencil, Plus, Save, Settings, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { INSTITUTE_MODULES, INSTITUTE_ROLES, createDefaultInstituteModules } from "../institution-modules";
import { isSupabaseConfigured, supabase } from "../supabase";

const ROLE_LABELS = Object.fromEntries(INSTITUTE_ROLES.map((role) => [role.id, role.label]));

function PortalNotice({ kind = "info", children }) {
  return <div className={`institute-notice is-${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

function InstitutePortal({ t }) {
  const [status, setStatus] = useState(isSupabaseConfigured ? "loading" : "unavailable");
  const [userId, setUserId] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [instituteId, setInstituteId] = useState("");
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [moduleSnapshot, setModuleSnapshot] = useState({ instituteId: "", rows: [] });
  const [draftSettings, setDraftSettings] = useState({});
  const [selectedModuleKey, setSelectedModuleKey] = useState("");
  const [adminView, setAdminView] = useState("workspace");
  const [recordSnapshot, setRecordSnapshot] = useState({ instituteId: "", moduleKey: "", rows: [] });
  const [classSnapshot, setClassSnapshot] = useState({ instituteId: "", rows: [] });
  const [peopleSnapshot, setPeopleSnapshot] = useState({ instituteId: "", rows: [] });
  const [invitationSnapshot, setInvitationSnapshot] = useState({ instituteId: "", rows: [] });
  const [rosterSnapshot, setRosterSnapshot] = useState({ instituteId: "", rows: [] });
  const [parentLinkSnapshot, setParentLinkSnapshot] = useState({ instituteId: "", rows: [] });
  const [memberDrafts, setMemberDrafts] = useState({});
  const [classDrafts, setClassDrafts] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const [instituteName, setInstituteName] = useState("");
  const [program, setProgram] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("teacher");
  const [inviteClassId, setInviteClassId] = useState("");
  const [className, setClassName] = useState("");
  const [classSection, setClassSection] = useState("");
  const [parentUserId, setParentUserId] = useState("");
  const [studentUserId, setStudentUserId] = useState("");
  const [recordTitle, setRecordTitle] = useState("");
  const [recordBody, setRecordBody] = useState("");
  const [recordClassId, setRecordClassId] = useState("");
  const [recordStudentId, setRecordStudentId] = useState("");
  const [editingRecordId, setEditingRecordId] = useState("");
  const [editingRecordTitle, setEditingRecordTitle] = useState("");
  const [editingRecordBody, setEditingRecordBody] = useState("");
  const [studentSnapshot, setStudentSnapshot] = useState({ instituteId: "", rows: [] });
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [progressSnapshot, setProgressSnapshot] = useState({ instituteId: "", studentId: "", rows: [] });

  const activeMembership = memberships.find((membership) => membership.institute_id === instituteId);
  const institute = Array.isArray(activeMembership?.institutes)
    ? activeMembership.institutes[0]
    : activeMembership?.institutes;
  const role = activeMembership?.role;
  const isAdmin = role === "admin";
  const classes = classSnapshot.instituteId === instituteId ? classSnapshot.rows : [];
  const people = peopleSnapshot.instituteId === instituteId ? peopleSnapshot.rows : [];
  const invitations = invitationSnapshot.instituteId === instituteId ? invitationSnapshot.rows : [];
  const roster = rosterSnapshot.instituteId === instituteId ? rosterSnapshot.rows : [];
  const parentLinks = parentLinkSnapshot.instituteId === instituteId ? parentLinkSnapshot.rows : [];
  const moduleSettings = useMemo(
    () => moduleSnapshot.instituteId === instituteId ? moduleSnapshot.rows : [],
    [instituteId, moduleSnapshot]
  );
  const moduleCatalog = useMemo(() => {
    const knownKeys = new Set(INSTITUTE_MODULES.map((module) => module.key));
    const remoteModules = moduleSettings
      .filter((setting) => !knownKeys.has(setting.module_key))
      .map((setting) => {
        const metadata = setting.settings || {};
        const label = setting.module_key.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
        return {
          key: setting.module_key,
          label: typeof metadata.label === "string" && metadata.label.trim() ? metadata.label : label,
          group: typeof metadata.group === "string" && metadata.group.trim() ? metadata.group : "Additional modules",
          defaultEnabled: setting.enabled,
          visibleTo: setting.visible_to_roles || ["admin"],
          editableBy: setting.editable_by_roles || ["admin"],
        };
      });
    return [...INSTITUTE_MODULES, ...remoteModules];
  }, [moduleSettings]);
  const enabledModules = useMemo(() => moduleCatalog
    .map((module) => ({
      ...module,
      setting: moduleSettings.find((setting) => setting.module_key === module.key),
    }))
    .filter(({ setting }) => setting?.enabled && setting.visible_to_roles?.includes(role)), [moduleCatalog, moduleSettings, role]);
  const activeModuleKey = enabledModules.some((module) => module.key === selectedModuleKey)
    ? selectedModuleKey
    : enabledModules[0]?.key || "";
  const activeSettings = moduleSettings.find((setting) => setting.module_key === activeModuleKey);
  const records = useMemo(
    () => recordSnapshot.instituteId === instituteId && recordSnapshot.moduleKey === activeModuleKey
      ? recordSnapshot.rows
      : [],
    [activeModuleKey, instituteId, recordSnapshot]
  );
  const visibleStudents = studentSnapshot.instituteId === instituteId ? studentSnapshot.rows : [];
  const progressStudentId = visibleStudents.some((student) => student.user_id === selectedStudentId)
    ? selectedStudentId
    : role === "student" ? userId : visibleStudents[0]?.user_id || "";
  const studentProgress = progressSnapshot.instituteId === instituteId && progressSnapshot.studentId === progressStudentId
    ? progressSnapshot.rows
    : [];
  const groupedModules = useMemo(() => moduleCatalog.reduce((groups, module) => {
    groups[module.group] = groups[module.group] || [];
    groups[module.group].push(module);
    return groups;
  }, {}), [moduleCatalog]);
  const isDirty = useMemo(() => moduleCatalog.some((module) => {
    const current = moduleSettings.find((setting) => setting.module_key === module.key);
    const draft = draftSettings[module.key];
    return current && draft && (
      current.enabled !== draft.enabled
      || [...(current.visible_to_roles || [])].sort().join(",") !== [...draft.visible_to_roles].sort().join(",")
    );
  }), [draftSettings, moduleCatalog, moduleSettings]);
  const canEditRecords = Boolean(activeSettings?.enabled && activeSettings.editable_by_roles?.includes(role));

  const loadMemberships = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setStatus("unavailable");
      return;
    }

    setStatus("loading");
    setError("");
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) {
      setStatus("signed-out");
      return;
    }
    setUserId(user.id);

    const { error: inviteError } = await supabase.rpc("accept_institute_invitations");
    if (inviteError) throw inviteError;

    const { data, error: membershipError } = await supabase
      .from("institute_memberships")
      .select("institute_id, user_id, role, class_id, display_name, institutes(id, name, program, academic_year, subscription_status)")
      .eq("user_id", user.id);
    if (membershipError) throw membershipError;

    const nextMemberships = data || [];
    setMemberships(nextMemberships);
    if (nextMemberships.length > 0) {
      setInstituteId((current) => nextMemberships.some((membership) => membership.institute_id === current)
        ? current
        : nextMemberships[0].institute_id);
      setStatus("ready");
      return;
    }

    const { data: entitlements, error: entitlementError } = await supabase
      .from("institute_subscription_entitlements")
      .select("id, status, valid_until")
      .eq("owner_user_id", user.id)
      .is("institute_id", null)
      .in("status", ["active", "trial"]);
    if (entitlementError) throw entitlementError;
    setHasEntitlement((entitlements || []).some((entitlement) => !entitlement.valid_until || new Date(entitlement.valid_until) > new Date()));
    setStatus("setup");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      loadMemberships().catch((loadError) => {
        if (cancelled) return;
        setError(loadError.message || "Could not load Institute access.");
        setStatus("error");
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [loadMemberships]);

  useEffect(() => {
    if (!activeMembership || !isAdmin) return undefined;

    let cancelled = false;
    async function loadModules() {
      const { data: existing, error: readError } = await supabase
        .from("institute_module_settings")
        .select("module_key, enabled, visible_to_roles, editable_by_roles, settings")
        .eq("institute_id", activeMembership.institute_id);
      if (readError) throw readError;

      const existingKeys = new Set((existing || []).map((setting) => setting.module_key));
      const missing = createDefaultInstituteModules()
        .filter((setting) => !existingKeys.has(setting.module_key))
        .map((setting) => ({ ...setting, institute_id: activeMembership.institute_id, updated_by: userId }));
      if (missing.length > 0) {
        const { error: seedError } = await supabase
          .from("institute_module_settings")
          .upsert(missing, { onConflict: "institute_id,module_key", ignoreDuplicates: true });
        if (seedError) throw seedError;
      }

      const { data: saved, error: savedError } = await supabase
        .from("institute_module_settings")
        .select("module_key, enabled, visible_to_roles, editable_by_roles, settings")
        .eq("institute_id", activeMembership.institute_id);
      if (savedError) throw savedError;
      if (cancelled) return;
      setModuleSnapshot({ instituteId: activeMembership.institute_id, rows: saved || [] });
      setDraftSettings(Object.fromEntries((saved || []).map((setting) => [setting.module_key, {
        enabled: setting.enabled,
        visible_to_roles: setting.visible_to_roles || [],
      }])));
    }

    loadModules().catch((loadError) => {
      if (!cancelled) setError(loadError.message || "Could not load Institute modules.");
    });
    return () => { cancelled = true; };
  }, [activeMembership, isAdmin, userId]);

  useEffect(() => {
    if (!activeMembership || isAdmin || adminView !== "workspace") return undefined;
    let cancelled = false;
    async function loadModules() {
      const { data, error: readError } = await supabase
        .from("institute_module_settings")
        .select("module_key, enabled, visible_to_roles, editable_by_roles, settings")
        .eq("institute_id", activeMembership.institute_id);
      if (readError) throw readError;
      if (!cancelled) setModuleSnapshot({ instituteId: activeMembership.institute_id, rows: data || [] });
    }
    loadModules().catch((loadError) => {
      if (!cancelled) setError(loadError.message || "Could not load enabled modules.");
    });
    return () => { cancelled = true; };
  }, [activeMembership, adminView, isAdmin]);

  useEffect(() => {
    if (!activeMembership || !activeModuleKey || adminView !== "workspace") {
      return undefined;
    }
    let cancelled = false;
    async function loadRecords() {
      const { data, error: readError } = await supabase
        .from("institute_records")
        .select("id, module_key, class_id, student_user_id, subject_id, source_user_id, data, created_by, created_at, updated_at")
        .eq("institute_id", activeMembership.institute_id)
        .eq("module_key", activeModuleKey)
        .order("created_at", { ascending: false })
        .limit(100);
      if (readError) throw readError;
      if (!cancelled) setRecordSnapshot({ instituteId: activeMembership.institute_id, moduleKey: activeModuleKey, rows: data || [] });
    }
    loadRecords().catch((loadError) => {
      if (!cancelled) setError(loadError.message || "Could not load Institute records.");
    });
    return () => { cancelled = true; };
  }, [activeMembership, activeModuleKey, adminView]);

  useEffect(() => {
    if (!activeMembership || activeModuleKey !== "progress-tracking" || adminView !== "workspace") return undefined;
    let cancelled = false;
    async function loadVisibleStudents() {
      const { data, error: readError } = await supabase.rpc("get_institute_visible_students", {
        p_institute_id: activeMembership.institute_id,
      });
      if (readError) throw readError;
      if (!cancelled) setStudentSnapshot({ instituteId: activeMembership.institute_id, rows: data || [] });
    }
    loadVisibleStudents().catch((loadError) => {
      if (!cancelled) setError(loadError.message || "Could not load permitted student progress.");
    });
    return () => { cancelled = true; };
  }, [activeMembership, activeModuleKey, adminView]);

  useEffect(() => {
    if (!activeMembership || activeModuleKey !== "progress-tracking" || !progressStudentId || adminView !== "workspace") return undefined;
    let cancelled = false;
    async function loadStudentProgress() {
      const { data, error: readError } = await supabase.rpc("get_institute_studentos_progress", {
        p_institute_id: activeMembership.institute_id,
        p_student_user_id: progressStudentId,
      });
      if (readError) throw readError;
      if (!cancelled) setProgressSnapshot({ instituteId: activeMembership.institute_id, studentId: progressStudentId, rows: data || [] });
    }
    loadStudentProgress().catch((loadError) => {
      if (!cancelled) setError(loadError.message || "Could not load StudentOS progress.");
    });
    return () => { cancelled = true; };
  }, [activeMembership, activeModuleKey, adminView, progressStudentId]);

  useEffect(() => {
    if (!activeMembership || !isAdmin || adminView !== "people") return undefined;
    let cancelled = false;
    async function loadPeople() {
      const [
        { data: memberRows, error: memberError },
        { data: classRows, error: classError },
        { data: invitationRows, error: invitationError },
      ] = await Promise.all([
        supabase.from("institute_memberships")
          .select("institute_id, user_id, role, class_id, display_name, created_at")
          .eq("institute_id", activeMembership.institute_id),
        supabase.from("institute_classes")
          .select("id, name, section, academic_year")
          .eq("institute_id", activeMembership.institute_id)
          .order("name"),
        supabase.from("institute_invitations")
          .select("id, email, role, class_id, status, created_at, accepted_at")
          .eq("institute_id", activeMembership.institute_id)
          .order("created_at", { ascending: false }),
      ]);
      if (memberError) throw memberError;
      if (classError) throw classError;
      if (invitationError) throw invitationError;
      if (!cancelled) {
        setPeopleSnapshot({ instituteId: activeMembership.institute_id, rows: memberRows || [] });
        setClassSnapshot({ instituteId: activeMembership.institute_id, rows: classRows || [] });
        setInvitationSnapshot({ instituteId: activeMembership.institute_id, rows: invitationRows || [] });
        setMemberDrafts((previous) => Object.fromEntries((memberRows || []).map((member) => [member.user_id, previous[member.user_id] || {
          role: member.role,
          class_id: member.class_id || "",
        }])));
        setClassDrafts((previous) => Object.fromEntries((classRows || []).map((classRow) => [classRow.id, previous[classRow.id] || {
          name: classRow.name,
          section: classRow.section || "",
        }])));
      }
    }
    loadPeople().catch((loadError) => {
      if (!cancelled) setError(loadError.message || "Could not load Institute members.");
    });
    return () => { cancelled = true; };
  }, [activeMembership, adminView, isAdmin]);

  useEffect(() => {
    if (!activeMembership || !["admin", "teacher", "student"].includes(role)) return undefined;
    let cancelled = false;
    async function loadAssignedClasses() {
      let query = supabase.from("institute_classes")
        .select("id, name, section, academic_year")
        .eq("institute_id", activeMembership.institute_id);
      if (role === "student") {
        query = activeMembership.class_id
          ? query.eq("id", activeMembership.class_id)
          : query.is("id", null);
      }
      const { data, error: readError } = await query.order("name");
      if (readError) throw readError;
      if (!cancelled) setClassSnapshot({ instituteId: activeMembership.institute_id, rows: data || [] });
    }
    loadAssignedClasses().catch((loadError) => {
      if (!cancelled) setError(loadError.message || "Could not load your Institute classes.");
    });
    return () => { cancelled = true; };
  }, [activeMembership, role]);

  useEffect(() => {
    if (!activeMembership || role !== "teacher" || adminView !== "workspace") return undefined;
    let cancelled = false;
    async function loadClassStudents() {
      const { data, error: readError } = await supabase.from("institute_memberships")
        .select("user_id, display_name, class_id")
        .eq("institute_id", activeMembership.institute_id)
        .eq("role", "student");
      if (readError) throw readError;
      if (!cancelled) setRosterSnapshot({ instituteId: activeMembership.institute_id, rows: data || [] });
    }
    loadClassStudents().catch((loadError) => {
      if (!cancelled) setError(loadError.message || "Could not load students permitted for your classes.");
    });
    return () => { cancelled = true; };
  }, [activeMembership, adminView, role]);

  useEffect(() => {
    if (!activeMembership || role !== "parent" || adminView !== "workspace" || !userId) return undefined;
    let cancelled = false;
    async function loadLinkedStudents() {
      const { data: links, error: linksError } = await supabase.from("institute_parent_links")
        .select("student_user_id")
        .eq("institute_id", activeMembership.institute_id)
        .eq("parent_user_id", userId);
      if (linksError) throw linksError;
      const { data: visibleStudentsData, error: visibleError } = await supabase.rpc("get_institute_visible_students", {
        p_institute_id: activeMembership.institute_id,
      });
      if (visibleError) throw visibleError;
      const visibleById = new Map((visibleStudentsData || []).map((student) => [student.user_id, student]));
      const linkedStudents = (links || []).map((link) => {
        const student = visibleById.get(link.student_user_id);
        return {
          user_id: link.student_user_id,
          display_name: student?.display_name || "Linked student",
          class_id: student?.class_id || null,
          profileVisible: Boolean(student),
        };
      });
      const permittedClassIds = [...new Set(linkedStudents.map((student) => student.profileVisible && student.class_id).filter(Boolean))];
      if (permittedClassIds.length > 0) {
        const { data: linkedClasses, error: classError } = await supabase.from("institute_classes")
          .select("id, name, section, academic_year")
          .eq("institute_id", activeMembership.institute_id)
          .in("id", permittedClassIds);
        if (classError) throw classError;
        if (!cancelled) setClassSnapshot({ instituteId: activeMembership.institute_id, rows: linkedClasses || [] });
      } else if (!cancelled) {
        setClassSnapshot({ instituteId: activeMembership.institute_id, rows: [] });
      }
      if (!cancelled) setParentLinkSnapshot({ instituteId: activeMembership.institute_id, rows: linkedStudents });
    }
    loadLinkedStudents().catch((loadError) => {
      if (!cancelled) setError(loadError.message || "Could not load linked student access.");
    });
    return () => { cancelled = true; };
  }, [activeMembership, adminView, role, userId]);

  function changeDraft(moduleKey, change) {
    setDraftSettings((previous) => ({
      ...previous,
      [moduleKey]: { ...previous[moduleKey], ...change },
    }));
  }

  function toggleAudience(moduleKey, roleId) {
    if (roleId === "admin") return;
    const current = draftSettings[moduleKey]?.visible_to_roles || [];
    const next = current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId];
    changeDraft(moduleKey, { visible_to_roles: [...new Set(["admin", ...next])] });
  }

  async function createInstitute(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Sign in before creating an Institute.");
      const { data, error: createError } = await supabase
        .from("institutes")
        .insert({ name: instituteName.trim(), program: program.trim(), academic_year: academicYear.trim(), created_by: user.id })
        .select("id")
        .single();
      if (createError) throw createError;

      const defaults = createDefaultInstituteModules().map((setting) => ({
        ...setting,
        institute_id: data.id,
        updated_by: user.id,
      }));
      const { error: moduleError } = await supabase
        .from("institute_module_settings")
        .upsert(defaults, { onConflict: "institute_id,module_key" });
      if (moduleError) throw moduleError;
      setNotice("Institute created. Your account is its Admin.");
      await loadMemberships();
    } catch (createError) {
      setError(createError.message || "Could not create Institute.");
    } finally {
      setBusy(false);
    }
  }

  async function saveModules() {
    if (!activeMembership || !userId) return;
    setBusy(true);
    setError("");
    setNotice("");
    const rows = moduleCatalog.map((module) => {
      const draft = draftSettings[module.key];
      const saved = moduleSettings.find((setting) => setting.module_key === module.key);
      return {
        institute_id: activeMembership.institute_id,
        module_key: module.key,
        enabled: draft?.enabled ?? module.defaultEnabled,
        visible_to_roles: [...new Set(["admin", ...(draft?.visible_to_roles || module.visibleTo)])],
        editable_by_roles: saved?.editable_by_roles || module.editableBy,
        settings: saved?.settings || {},
        updated_by: userId,
      };
    });
    try {
      const { error: saveError } = await supabase
        .from("institute_module_settings")
        .upsert(rows, { onConflict: "institute_id,module_key" });
      if (saveError) throw saveError;
      setModuleSnapshot({ instituteId: activeMembership.institute_id, rows });
      setDraftSettings(Object.fromEntries(rows.map((setting) => [setting.module_key, {
        enabled: setting.enabled,
        visible_to_roles: setting.visible_to_roles,
      }])));
      setNotice("Module settings saved. Existing records were kept.");
    } catch (saveError) {
      setError(saveError.message || "Could not save module settings.");
    } finally {
      setBusy(false);
    }
  }

  async function createInvite(event) {
    event.preventDefault();
    if (!activeMembership || !userId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: inviteError } = await supabase.from("institute_invitations").insert({
        institute_id: activeMembership.institute_id,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        class_id: inviteClassId || null,
        invited_by: userId,
      });
      if (inviteError) throw inviteError;
      setInviteEmail("");
      const { data, error: reloadError } = await supabase.from("institute_invitations")
        .select("id, email, role, class_id, status, created_at, accepted_at")
        .eq("institute_id", activeMembership.institute_id)
        .order("created_at", { ascending: false });
      if (reloadError) throw reloadError;
      setInvitationSnapshot({ instituteId: activeMembership.institute_id, rows: data || [] });
      setNotice("Invitation saved. The member can accept it after signing in with this email.");
    } catch (inviteError) {
      setError(inviteError.message || "Could not create invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMembership(member) {
    const draft = memberDrafts[member.user_id];
    if (!activeMembership || !draft || member.role === "admin") return;
    setBusy(true);
    setError("");
    try {
      const { data, error: updateError } = await supabase.from("institute_memberships")
        .update({ role: draft.role, class_id: draft.class_id || null })
        .eq("institute_id", activeMembership.institute_id)
        .eq("user_id", member.user_id)
        .select("institute_id, user_id, role, class_id, display_name, created_at")
        .single();
      if (updateError) throw updateError;
      setPeopleSnapshot((previous) => ({
        instituteId: activeMembership.institute_id,
        rows: previous.rows.map((row) => row.user_id === member.user_id ? data : row),
      }));
      setMemberDrafts((previous) => ({ ...previous, [member.user_id]: { role: data.role, class_id: data.class_id || "" } }));
      setNotice("Member access updated.");
    } catch (updateError) {
      setError(updateError.message || "Could not update member access.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMembership(member) {
    if (!activeMembership || member.role === "admin") return;
    setBusy(true);
    setError("");
    try {
      const { error: deleteError } = await supabase.from("institute_memberships")
        .delete()
        .eq("institute_id", activeMembership.institute_id)
        .eq("user_id", member.user_id);
      if (deleteError) throw deleteError;
      setPeopleSnapshot((previous) => ({
        instituteId: activeMembership.institute_id,
        rows: previous.rows.filter((row) => row.user_id !== member.user_id),
      }));
      setMemberDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== member.user_id)));
      setNotice("Membership removed. Institute records were retained.");
    } catch (deleteError) {
      setError(deleteError.message || "Could not remove membership.");
    } finally {
      setBusy(false);
    }
  }

  async function updateClass(event, classRow) {
    event.preventDefault();
    if (!activeMembership) return;
    const draft = classDrafts[classRow.id] || classRow;
    setBusy(true);
    setError("");
    try {
      const { data, error: updateError } = await supabase.from("institute_classes")
        .update({ name: draft.name.trim(), section: draft.section.trim() })
        .eq("institute_id", activeMembership.institute_id)
        .eq("id", classRow.id)
        .select("id, name, section, academic_year")
        .single();
      if (updateError) throw updateError;
      setClassSnapshot((previous) => ({
        instituteId: activeMembership.institute_id,
        rows: previous.rows.map((row) => row.id === data.id ? data : row),
      }));
      setClassDrafts((previous) => ({ ...previous, [data.id]: { name: data.name, section: data.section || "" } }));
      setNotice("Class updated.");
    } catch (updateError) {
      setError(updateError.message || "Could not update class.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(invitation) {
    if (!activeMembership || invitation.status !== "pending") return;
    setBusy(true);
    setError("");
    try {
      const { data, error: updateError } = await supabase.from("institute_invitations")
        .update({ status: "revoked" })
        .eq("institute_id", activeMembership.institute_id)
        .eq("id", invitation.id)
        .select("id, email, role, class_id, status, created_at, accepted_at")
        .single();
      if (updateError) throw updateError;
      setInvitationSnapshot((previous) => ({
        instituteId: activeMembership.institute_id,
        rows: previous.rows.map((row) => row.id === data.id ? data : row),
      }));
      setNotice("Invitation revoked.");
    } catch (updateError) {
      setError(updateError.message || "Could not revoke invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function createClass(event) {
    event.preventDefault();
    if (!activeMembership) return;
    setBusy(true);
    setError("");
    try {
      const { error: classError } = await supabase.from("institute_classes").insert({
        institute_id: activeMembership.institute_id,
        name: className.trim(),
        section: classSection.trim(),
        academic_year: institute?.academic_year || "",
      });
      if (classError) throw classError;
      setClassName("");
      setClassSection("");
      const { data, error: reloadError } = await supabase.from("institute_classes")
        .select("id, name, section, academic_year")
        .eq("institute_id", activeMembership.institute_id)
        .order("name");
      if (reloadError) throw reloadError;
      setClassSnapshot({ instituteId: activeMembership.institute_id, rows: data || [] });
      setNotice("Class added.");
    } catch (classError) {
      setError(classError.message || "Could not add class.");
    } finally {
      setBusy(false);
    }
  }

  async function linkParent(event) {
    event.preventDefault();
    if (!activeMembership) return;
    setBusy(true);
    setError("");
    try {
      const { error: linkError } = await supabase.from("institute_parent_links").insert({
        institute_id: activeMembership.institute_id,
        parent_user_id: parentUserId,
        student_user_id: studentUserId,
      });
      if (linkError) throw linkError;
      setParentUserId("");
      setStudentUserId("");
      setNotice("Parent linked to student.");
    } catch (linkError) {
      setError(linkError.message || "Could not link parent.");
    } finally {
      setBusy(false);
    }
  }

  async function publishRecord(event) {
    event.preventDefault();
    if (!activeMembership || !activeSettings || !userId) return;
    setBusy(true);
    setError("");
    try {
      const recordStudent = role === "student" ? userId : recordStudentId || null;
      const recordClass = role === "student" ? activeMembership.class_id : recordClassId || activeMembership.class_id || null;
      const { error: recordError } = await supabase.from("institute_records").insert({
        institute_id: activeMembership.institute_id,
        module_key: activeModuleKey,
        class_id: recordClass,
        student_user_id: recordStudent,
        source_user_id: recordStudent,
        created_by: userId,
        data: { title: recordTitle.trim(), description: recordBody.trim() },
      });
      if (recordError) throw recordError;
      setRecordTitle("");
      setRecordBody("");
      setRecordStudentId("");
      const { data, error: readError } = await supabase.from("institute_records")
        .select("id, module_key, class_id, student_user_id, subject_id, source_user_id, data, created_by, created_at, updated_at")
        .eq("institute_id", activeMembership.institute_id)
        .eq("module_key", activeModuleKey)
        .order("created_at", { ascending: false })
        .limit(100);
      if (readError) throw readError;
      setRecordSnapshot({ instituteId: activeMembership.institute_id, moduleKey: activeModuleKey, rows: data || [] });
      setNotice("Record published.");
    } catch (recordError) {
      setError(recordError.message || "Could not publish record.");
    } finally {
      setBusy(false);
    }
  }

  function startEditingRecord(record) {
    setEditingRecordId(record.id);
    setEditingRecordTitle(record.data?.title || "");
    setEditingRecordBody(record.data?.description || "");
  }

  async function updateRecord(event, record) {
    event.preventDefault();
    if (!activeMembership || !activeSettings || !canEditRecords) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: updateError } = await supabase.from("institute_records")
        .update({
          data: {
            ...(record.data || {}),
            title: editingRecordTitle.trim(),
            description: editingRecordBody.trim(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("institute_id", activeMembership.institute_id)
        .eq("id", record.id)
        .select("id, module_key, class_id, student_user_id, subject_id, source_user_id, data, created_by, created_at, updated_at")
        .single();
      if (updateError) throw updateError;
      setRecordSnapshot((previous) => ({
        instituteId: activeMembership.institute_id,
        moduleKey: activeModuleKey,
        rows: previous.rows.map((row) => row.id === data.id ? data : row),
      }));
      setEditingRecordId("");
      setNotice("Record updated.");
    } catch (updateError) {
      setError(updateError.message || "Could not update this record.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unavailable") {
    return <PortalNotice>Institute access requires Supabase. Configure Supabase and apply <code>supabase-institute-schema.sql</code> to enable shared memberships and module settings.</PortalNotice>;
  }
  if (status === "loading") return <div className="institute-loading">Loading Institute workspace…</div>;
  if (status === "signed-out") return <PortalNotice>Sign in with the email associated with your Institute membership to continue.</PortalNotice>;
  if (status === "error" && memberships.length === 0) {
    return <PortalNotice kind="error">{error || "Could not load Institute access."} Apply the Institute schema migration and verify your membership.</PortalNotice>;
  }
  if (status === "setup") {
    return (
      <div className="institute-portal" style={{ "--institute-border": t.border, "--institute-surface": t.surface, "--institute-raised": t.surfaceRaised, "--institute-control": t.controlSurface, "--institute-text": t.text, "--institute-muted": t.textMuted }}>
        <header className="institute-page-heading">
          <div><p className="institute-eyebrow">Workspace setup</p><h1>Create your Institute</h1><p>Creating an Institute makes your account its Admin.</p></div>
          <ShieldCheck size={24} />
        </header>
        {error && <PortalNotice kind="error">{error}</PortalNotice>}
        {notice && <PortalNotice kind="success">{notice}</PortalNotice>}
        {hasEntitlement ? (
          <form className="institute-form" onSubmit={createInstitute}>
            <label>Institute name<input required value={instituteName} onChange={(event) => setInstituteName(event.target.value)} placeholder="e.g. Apex Learning Institute" /></label>
            <label>Program<input value={program} onChange={(event) => setProgram(event.target.value)} placeholder="e.g. JEE 2027" /></label>
            <label>Academic year<input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="e.g. 2026–27" /></label>
            <button className="institute-primary-button" type="submit" disabled={busy || !instituteName.trim()}><Building2 size={15} />{busy ? "Creating…" : "Create Institute"}</button>
          </form>
        ) : (
          <div className="institute-empty-state">
            <h2>No active Institute subscription</h2>
            <p>Institute Admin access is provisioned by a verified billing entitlement. The current Plans page is demo-only and cannot grant Admin access.</p>
          </div>
        )}
      </div>
    );
  }

  const currentRole = activeMembership?.role || "student";
  const visibleModules = moduleCatalog
    .map((module) => ({ ...module, setting: moduleSettings.find((setting) => setting.module_key === module.key) }))
    .filter(({ setting }) => setting?.enabled && setting.visible_to_roles?.includes(currentRole));
  const activeModule = moduleCatalog.find((module) => module.key === activeModuleKey);
  const filterText = filter.trim().toLowerCase();
  const displayedModules = visibleModules.filter((module) => !filterText || module.label.toLowerCase().includes(filterText));
  const parents = people.filter((member) => member.role === "parent");
  const students = people.filter((member) => member.role === "student");
  const classNameFor = (classId) => classes.find((entry) => entry.id === classId)?.name || "Institute-wide";

  return (
    <div className="institute-portal" style={{ "--institute-border": t.border, "--institute-surface": t.surface, "--institute-raised": t.surfaceRaised, "--institute-control": t.controlSurface, "--institute-text": t.text, "--institute-muted": t.textMuted }}>
      <header className="institute-page-heading">
        <div>
          <p className="institute-eyebrow">Institute workspace · {ROLE_LABELS[currentRole]}</p>
          <h1>{institute?.name || "Institute"}</h1>
          <p>{[institute?.program, institute?.academic_year].filter(Boolean).join(" · ") || "Shared learning workspace"}</p>
        </div>
        <div className="institute-heading-actions">
          {memberships.length > 1 && (
            <label className="institute-switcher"><span>Institute</span><select value={instituteId} onChange={(event) => setInstituteId(event.target.value)}>
              {memberships.map((membership) => <option key={membership.institute_id} value={membership.institute_id}>{membership.institutes?.name || "Institute"}</option>)}
            </select></label>
          )}
          <span className="institute-role-badge"><ShieldCheck size={13} />{ROLE_LABELS[currentRole]}</span>
        </div>
      </header>

      <div className="institute-toolbar">
        <nav className="institute-tabs" aria-label="Institute workspace">
          <button type="button" className={adminView === "workspace" ? "is-active" : ""} onClick={() => setAdminView("workspace")}><BookOpen size={14} />Workspace</button>
          {isAdmin && <button type="button" className={adminView === "modules" ? "is-active" : ""} onClick={() => setAdminView("modules")}><Settings size={14} />Configuration</button>}
          {isAdmin && <button type="button" className={adminView === "people" ? "is-active" : ""} onClick={() => setAdminView("people")}><Users size={14} />People & classes</button>}
        </nav>
        {adminView === "workspace" && visibleModules.length > 0 && (
          <label className="institute-module-search"><span className="sr-only">Filter modules</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter modules" /></label>
        )}
      </div>

      {error && <PortalNotice kind="error">{error}</PortalNotice>}
      {notice && <PortalNotice kind="success">{notice}</PortalNotice>}

      {adminView === "modules" && isAdmin ? (
        <section className="institute-configuration">
          <div className="institute-section-heading"><div><h2>Module configuration</h2><p>Choose what your institute uses and who can see each enabled module. Disabled modules keep their data.</p></div><button type="button" className="institute-primary-button" onClick={saveModules} disabled={busy || !isDirty}><Save size={14} />{busy ? "Saving…" : "Save changes"}</button></div>
          {Object.entries(groupedModules).map(([group, modules]) => (
            <section className="institute-module-group" key={group}>
              <h3>{group}</h3>
              <div className="institute-module-list">
                {modules.map((module) => {
                  const draft = draftSettings[module.key] || { enabled: module.defaultEnabled, visible_to_roles: module.visibleTo };
                  return (
                    <article className={`institute-module-row${draft.enabled ? " is-enabled" : ""}`} key={module.key}>
                      <div className="institute-module-main">
                        <label className="institute-module-toggle"><input type="checkbox" checked={draft.enabled} onChange={(event) => changeDraft(module.key, { enabled: event.target.checked })} /><span className="institute-toggle-track" /><span>{module.label}</span></label>
                        <span className="institute-module-state">{draft.enabled ? "Enabled" : "Disabled"}</span>
                      </div>
                      {draft.enabled && <div className="institute-audience"><span>Visible to</span>{INSTITUTE_ROLES.map((entry) => (
                        <label key={entry.id} className="institute-role-option"><input type="checkbox" checked={draft.visible_to_roles.includes(entry.id)} disabled={entry.id === "admin"} onChange={() => toggleAudience(module.key, entry.id)} />{entry.label}</label>
                      ))}</div>}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </section>
      ) : adminView === "people" && isAdmin ? (
        <section className="institute-people-grid">
          <div className="institute-admin-panel"><h2>Invite a member</h2><p>Invites are tied to email; the member accepts after signing in with that address.</p>
            <form className="institute-form" onSubmit={createInvite}>
              <label>Email<input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" /></label>
              <label>Role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>{INSTITUTE_ROLES.filter((entry) => entry.id !== "admin").map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
              <label>Class / batch<select value={inviteClassId} onChange={(event) => setInviteClassId(event.target.value)}><option value="">Institute-wide</option>{classes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.section ? ` · ${entry.section}` : ""}</option>)}</select></label>
              <button className="institute-primary-button" type="submit" disabled={busy}><Plus size={14} />Create invitation</button>
            </form>
          </div>
          <div className="institute-admin-panel"><h2>Classes & batches</h2><form className="institute-inline-form" onSubmit={createClass}><input required value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Class name" /><input value={classSection} onChange={(event) => setClassSection(event.target.value)} placeholder="Section" /><button type="submit" aria-label="Add class" disabled={busy}><Plus size={15} /></button></form>
            <ul className="institute-simple-list">{classes.map((entry) => {
              const draft = classDrafts[entry.id] || { name: entry.name, section: entry.section || "" };
              return <li className="institute-class-edit" key={entry.id}><form onSubmit={(event) => updateClass(event, entry)}><input aria-label="Class name" required value={draft.name} onChange={(event) => setClassDrafts((previous) => ({ ...previous, [entry.id]: { ...draft, name: event.target.value } }))} /><input aria-label="Section" value={draft.section} onChange={(event) => setClassDrafts((previous) => ({ ...previous, [entry.id]: { ...draft, section: event.target.value } }))} /><button type="submit" aria-label={`Save ${entry.name}`} disabled={busy}><Save size={13} /></button></form><small>{entry.academic_year || institute?.academic_year}</small></li>;
            })}{classes.length === 0 && <li className="is-muted">No classes added yet.</li>}</ul>
          </div>
          <div className="institute-admin-panel institute-admin-panel--wide"><h2>Members</h2><ul className="institute-simple-list">{people.map((member) => {
            const draft = memberDrafts[member.user_id] || { role: member.role, class_id: member.class_id || "" };
            return <li className="institute-member-edit" key={member.user_id}><div><span>{member.display_name || member.user_id}</span><small>{member.user_id}</small></div><select aria-label={`Role for ${member.display_name || member.user_id}`} disabled={busy || member.role === "admin"} value={draft.role} onChange={(event) => setMemberDrafts((previous) => ({ ...previous, [member.user_id]: { ...draft, role: event.target.value } }))}>{INSTITUTE_ROLES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><select aria-label={`Class for ${member.display_name || member.user_id}`} disabled={busy} value={draft.class_id} onChange={(event) => setMemberDrafts((previous) => ({ ...previous, [member.user_id]: { ...draft, class_id: event.target.value } }))}><option value="">Institute-wide</option>{classes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.section ? ` · ${entry.section}` : ""}</option>)}</select><button type="button" aria-label={`Save ${member.display_name || member.user_id}`} disabled={busy || member.role === "admin"} onClick={() => saveMembership(member)}><Save size={13} /></button>{member.role !== "admin" && <button type="button" className="institute-danger-button" aria-label={`Remove ${member.display_name || member.user_id}`} disabled={busy} onClick={() => removeMembership(member)}><Trash2 size={13} /></button>}</li>;
          })}{people.length === 0 && <li className="is-muted">No members found.</li>}</ul></div>
          <div className="institute-admin-panel institute-admin-panel--wide"><h2>Invitations</h2><ul className="institute-simple-list">{invitations.map((invitation) => <li className="institute-invitation-row" key={invitation.id}><span>{invitation.email}</span><small>{ROLE_LABELS[invitation.role]} · {classNameFor(invitation.class_id)} · {invitation.status}</small>{invitation.status === "pending" && <button type="button" className="institute-danger-button" aria-label={`Revoke invitation for ${invitation.email}`} disabled={busy} onClick={() => revokeInvitation(invitation)}><X size={13} /></button>}</li>)}{invitations.length === 0 && <li className="is-muted">No invitations yet.</li>}</ul></div>
          <div className="institute-admin-panel"><h2>Link a parent</h2><p>Connect an existing parent account to a student account.</p><form className="institute-form" onSubmit={linkParent}>
            <label>Parent<select required value={parentUserId} onChange={(event) => setParentUserId(event.target.value)}><option value="">Select parent</option>{parents.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.user_id}</option>)}</select></label>
            <label>Student<select required value={studentUserId} onChange={(event) => setStudentUserId(event.target.value)}><option value="">Select student</option>{students.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.user_id}</option>)}</select></label>
            <button type="submit" className="institute-secondary-button" disabled={busy}>Link parent and student</button>
          </form></div>
        </section>
      ) : (
        <section className="institute-workspace">
          <aside className="institute-module-nav" aria-label="Enabled Institute modules">
            <p>Enabled modules</p>
            {displayedModules.map((module) => <button key={module.key} type="button" className={activeModuleKey === module.key ? "is-active" : ""} onClick={() => setSelectedModuleKey(module.key)}>{module.label}<ChevronRight size={14} /></button>)}
            {displayedModules.length === 0 && <span className="is-muted">No enabled modules match.</span>}
          </aside>
          <div className="institute-module-content">
            {currentRole === "teacher" && (
              <section className="institute-role-roster">
                <div className="institute-role-roster__heading"><h2>Students in your classes</h2><span>{roster.length}</span></div>
                {roster.map((student) => <div className="institute-role-roster__row" key={student.user_id}>
                  <span>{student.display_name || "Student"}</span>
                  <small>{classNameFor(student.class_id)}</small>
                </div>)}
                {roster.length === 0 && <p className="is-muted">No students are available within your class permissions.</p>}
              </section>
            )}
            {currentRole === "parent" && (
              <section className="institute-role-roster">
                <div className="institute-role-roster__heading"><h2>Linked students</h2><span>{parentLinks.length}</span></div>
                {parentLinks.map((student) => <div className="institute-role-roster__row" key={student.user_id}>
                  <span>{student.display_name}</span>
                  {student.profileVisible && <small>{classNameFor(student.class_id)}</small>}
                </div>)}
                {parentLinks.length === 0 && <p className="is-muted">No students are linked to this Parent account.</p>}
              </section>
            )}
            {activeModule ? (
              <>
                <div className="institute-section-heading"><div><p className="institute-eyebrow">{activeModule.group}</p><h2>{activeModule.label}</h2></div>{activeMembership?.class_id && <span className="institute-role-badge">{classNameFor(activeMembership.class_id)}</span>}</div>
                {activeModuleKey === "progress-tracking" && (
                  <StudentProgressPanel
                    students={visibleStudents}
                    selectedStudentId={progressStudentId}
                    onSelectStudent={setSelectedStudentId}
                    progressRows={studentProgress}
                    role={currentRole}
                  />
                )}
                {canEditRecords && <form className="institute-record-form" onSubmit={publishRecord}>
                  <div className="institute-record-form__title"><h3>Publish to {activeModule.label}</h3><span>{ROLE_LABELS[currentRole]} access</span></div>
                  <input required value={recordTitle} onChange={(event) => setRecordTitle(event.target.value)} placeholder="Title" />
                  <textarea value={recordBody} onChange={(event) => setRecordBody(event.target.value)} placeholder="Details or module data" rows={3} />
                  <div className="institute-record-form__footer">
                    {isAdmin && <select value={recordClassId} onChange={(event) => setRecordClassId(event.target.value)}><option value="">Institute-wide</option>{classes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.section ? ` · ${entry.section}` : ""}</option>)}</select>}
                    {isAdmin && <input value={recordStudentId} onChange={(event) => setRecordStudentId(event.target.value)} placeholder="Student user ID (optional)" />}
                    <button className="institute-primary-button" type="submit" disabled={busy}><Plus size={14} />Publish</button>
                  </div>
                </form>}
                <div className="institute-record-list">
                  {records.map((record) => <article className="institute-record" key={record.id}>
                    {editingRecordId === record.id ? (
                      <form className="institute-record-edit" onSubmit={(event) => updateRecord(event, record)}>
                        <input required aria-label="Record title" value={editingRecordTitle} onChange={(event) => setEditingRecordTitle(event.target.value)} />
                        <textarea aria-label="Record details" rows={3} value={editingRecordBody} onChange={(event) => setEditingRecordBody(event.target.value)} />
                        <div className="institute-record-edit__actions">
                          <button className="institute-primary-button" type="submit" disabled={busy}><Check size={14} />Save</button>
                          <button className="institute-secondary-button" type="button" onClick={() => setEditingRecordId("")} disabled={busy}><X size={14} />Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div><h3>{record.data?.title || activeModule.label}</h3><p>{record.data?.description || JSON.stringify(record.data)}</p></div>
                        <div className="institute-record__meta"><span>{classNameFor(record.class_id)}</span><time>{new Date(record.created_at).toLocaleDateString()}</time>{canEditRecords && <button type="button" className="institute-record-edit-button" aria-label={`Edit ${record.data?.title || activeModule.label}`} onClick={() => startEditingRecord(record)}><Pencil size={13} /></button>}</div>
                      </>
                    )}
                  </article>)}
                  {records.length === 0 && <div className="institute-empty-state"><h3>No {activeModule.label.toLowerCase()} published yet</h3><p>Records added here stay stored when this module is disabled.</p></div>}
                </div>
              </>
            ) : (
              <div className="institute-empty-state"><h2>No modules enabled</h2><p>An Admin can enable modules in Configuration.</p></div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StudentProgressPanel({ students, selectedStudentId, onSelectStudent, progressRows, role }) {
  const sessions = progressRows.find((row) => row.data_key === "studentos:sessions")?.value;
  const topicStatus = progressRows.find((row) => row.data_key === "studentos:topic-status:jee")?.value;
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const focusedMinutes = Math.round(sessionList.reduce((total, session) => total + (Number(session.durationSec) || 0), 0) / 60);
  const completedTopics = topicStatus && typeof topicStatus === "object"
    ? Object.values(topicStatus).filter((status) => status === "completed").length
    : 0;

  return (
    <section className="institute-student-progress">
      {role !== "student" && (
        <label className="institute-progress-student">
          Student
          <select value={selectedStudentId} onChange={(event) => onSelectStudent(event.target.value)}>
            <option value="">Select permitted student</option>
            {students.map((student) => <option key={student.user_id} value={student.user_id}>{student.display_name || student.user_id}</option>)}
          </select>
        </label>
      )}
      <div className="institute-progress-metrics">
        <div><span>Study sessions</span><strong>{sessionList.length}</strong></div>
        <div><span>Focused minutes</span><strong>{focusedMinutes}</strong></div>
        <div><span>Completed topics</span><strong>{completedTopics}</strong></div>
      </div>
      <p>Live from the student’s existing StudentOS study sessions and syllabus progress.</p>
      {progressRows.length === 0 && selectedStudentId && <span className="institute-progress-empty">No StudentOS progress data is available for this account yet.</span>}
      {!selectedStudentId && role !== "student" && <span className="institute-progress-empty">No students are available in your current Institute access scope.</span>}
    </section>
  );
}

export default InstitutePortal;
