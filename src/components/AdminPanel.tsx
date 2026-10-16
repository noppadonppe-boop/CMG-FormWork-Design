import React, {useEffect, useMemo, useState} from 'react';
import {
  DEPARTMENT_OPTIONS,
  PROJECT_PERMISSION_OPTIONS,
  ROLE_OPTIONS,
  deleteProject as removeProject,
  isMasterAdminProfile,
  listAllProjects,
  projectPermissionPreset,
  subscribeUsers,
  updateManagedUser,
  type ProjectPermission,
  type ProjectPermissionMap,
  type SharedProject,
  type UserProfile,
  type UserRole,
} from '../firebase';
import {useAuth} from '../auth';
import {ApiSettingsPanel} from './ApiSettingsPanel';

function rolesOf(user: UserProfile) {return Array.isArray(user.role) ? user.role : [user.role as UserRole];}
function statusLabel(status: UserProfile['status']) {return status === 'approved' ? 'อนุมัติแล้ว' : status === 'rejected' ? 'ปฏิเสธ' : 'รออนุมัติ';}
function rightsFor(user: UserProfile, projectId: string): ProjectPermission[] {
  const explicit = user.projectPermissions?.[projectId];
  if (Array.isArray(explicit) && explicit.length) return explicit;
  return user.assignedProjects?.includes(projectId) ? ['view', 'edit'] : [];
}
function permissionLevel(rights: ProjectPermission[]) {
  if (rights.includes('manage')) return 'manage';
  if (rights.includes('edit')) return 'edit';
  if (rights.includes('view')) return 'view';
  return '';
}
function permissionLabel(level: string) {return level === 'manage' ? 'สิทธิ์เต็มในโครงการ' : level === 'edit' ? 'ดูและแก้ไข' : 'ดูอย่างเดียว';}
function permissionMapFor(user: UserProfile): ProjectPermissionMap {
  const ids = new Set([...Object.keys(user.projectPermissions ?? {}), ...(user.assignedProjects ?? [])]);
  return Object.fromEntries([...ids].map(id => [id, rightsFor(user, id)]));
}

function ProjectManagement({projects, users, busy, onDelete}: {projects: SharedProject[]; users: UserProfile[]; busy: boolean; onDelete: (project: SharedProject) => void}) {
  return <div className="project-management">
    <div className="project-management-intro"><div><span className="option-tag">MASTER ADMIN · PROJECT CONTROL</span><h2>จัดการโครงการ</h2><p>MasterAdmin เห็นและจัดการโครงการทั้งหมด รวมถึงลบโครงการและถอดสิทธิ์ของสมาชิกที่เกี่ยวข้อง</p></div><span className="pill approved">เข้าถึงทั้งหมด</span></div>
    {projects.length ? <div className="table-scroll"><table className="users-table project-table"><thead><tr><th>โครงการ</th><th>รหัส</th><th>แบบ</th><th>ผู้มีสิทธิ์</th><th>การดำเนินการ</th></tr></thead><tbody>
      {projects.map(project => {
        const members = users.filter(user => rightsFor(user, project.id).length > 0);
        return <tr key={project.id}><td><b>{project.name}</b></td><td><span className="table-sub">{project.code}</span></td><td>{project.cases.length} รายการ</td><td>{members.length} คน</td><td><button className="btn danger" disabled={busy} onClick={() => onDelete(project)}>ลบโครงการ</button></td></tr>;
      })}
    </tbody></table></div> : <div className="empty-state compact"><p>ยังไม่มีโครงการในระบบ</p></div>}
  </div>;
}

export function AdminPanel({onPendingCount}: {onPendingCount?: (count: number) => void}) {
  const {userProfile} = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<UserProfile> & {projectPermissions?: ProjectPermissionMap}>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'users' | 'projects' | 'api'>('users');

  async function refreshProjects() {
    try {setProjects(await listAllProjects());} catch (e) {setError((e as Error).message);}
  }

  useEffect(() => {
    let stop = () => {};
    try {
      stop = subscribeUsers(next => {
        const ordered = [...next].sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending'));
        setUsers(ordered);
        onPendingCount?.(ordered.filter(user => user.status === 'pending').length);
      }, e => setError(e.message));
    } catch (e) {setError((e as Error).message);}
    void refreshProjects();
    return () => stop();
  }, [onPendingCount]);

  const pending = useMemo(() => users.filter(user => user.status === 'pending').length, [users]);
  function startEdit(user: UserProfile) {
    setSelected(user.email);
    setDraft({firstName: user.firstName, lastName: user.lastName, position: user.position, department: user.department ?? 'Other', role: rolesOf(user), status: user.status, assignedProjects: user.assignedProjects ?? [], projectPermissions: permissionMapFor(user)});
    setMessage('');
  }
  function updateRoleSelection(event: React.ChangeEvent<HTMLSelectElement>) {setDraft({...draft, role: Array.from(event.target.selectedOptions).map(option => option.value as UserRole)});}
  function toggleProject(projectId: string) {
    const current = {...(draft.projectPermissions ?? {})};
    if (current[projectId]?.length) delete current[projectId];
    else current[projectId] = projectPermissionPreset('edit');
    setDraft({...draft, projectPermissions: current, assignedProjects: Object.keys(current).filter(id => current[id]?.length)});
  }
  function setProjectPermission(projectId: string, permission: ProjectPermission | '') {
    const current = {...(draft.projectPermissions ?? {})};
    if (!permission) delete current[projectId];
    else current[projectId] = projectPermissionPreset(permission);
    setDraft({...draft, projectPermissions: current, assignedProjects: Object.keys(current).filter(id => current[id]?.length)});
  }
  async function save() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const projectPermissions = Object.fromEntries(Object.entries(draft.projectPermissions ?? {}).filter(([, rights]) => rights.length > 0));
      await updateManagedUser(selected, {firstName: String(draft.firstName ?? ''), lastName: String(draft.lastName ?? ''), position: String(draft.position ?? ''), department: String(draft.department ?? 'Other'), role: draft.role as UserRole[], status: draft.status as UserProfile['status'], assignedProjects: Object.keys(projectPermissions), projectPermissions});
      setMessage(`บันทึกสิทธิ์ของ ${selected} แล้ว`); setSelected(null);
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function deleteSelectedProject(project: SharedProject) {
    if (!window.confirm(`ยืนยันลบโครงการ “${project.name}” หรือไม่? ข้อมูลแบบและ Snapshot ที่อยู่ในโครงการจะถูกลบ และผู้ใช้ทุกคนจะถูกถอดสิทธิ์โครงการนี้`)) return;
    setBusy(true); setError('');
    try {
      await removeProject(project.id);
      setProjects(current => current.filter(item => item.id !== project.id));
      setUsers(current => current.map(user => ({...user, assignedProjects: (user.assignedProjects ?? []).filter(id => id !== project.id), projectPermissions: Object.fromEntries(Object.entries(user.projectPermissions ?? {}).filter(([id]) => id !== project.id))})));
      setMessage(`ลบโครงการ ${project.name} และถอดสิทธิ์สมาชิกแล้ว`);
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  if (!userProfile?.role.some(role => ['MasterAdmin', 'SuperAdmin', 'Admin'].includes(role))) return <section className="card"><h3>ไม่มีสิทธิ์เข้าถึง</h3><p>เฉพาะผู้ดูแลระบบเท่านั้น</p></section>;

  const isMaster = isMasterAdminProfile(userProfile);
  const tabs = <div className="admin-tabs" role="tablist">
    <button role="tab" aria-selected={view === 'users'} className={`admin-tab ${view === 'users' ? 'active' : ''}`} onClick={() => setView('users')}>ผู้ใช้งาน</button>
    {isMaster && <button role="tab" aria-selected={view === 'projects'} className={`admin-tab ${view === 'projects' ? 'active' : ''}`} onClick={() => setView('projects')}>โครงการทั้งหมด</button>}
    {isMaster && <button role="tab" aria-selected={view === 'api'} className={`admin-tab ${view === 'api' ? 'active' : ''}`} onClick={() => setView('api')}>Manage API</button>}
  </div>;
  if (view === 'api' && isMaster) return <section className="admin-panel">{tabs}<ApiSettingsPanel/></section>;
  if (view === 'projects' && isMaster) return <section className="admin-panel">{tabs}{message && <div className="notice">{message}</div>}{error && <div className="warning">{error}</div>}<ProjectManagement projects={projects} users={users} busy={busy} onDelete={project => void deleteSelectedProject(project)}/></section>;

  return <section className="admin-panel">
    {tabs}
    <div className="admin-heading"><div><span className="option-tag">USER & ACCESS CONTROL</span><h2>จัดการผู้ใช้งาน</h2><p>แก้ไขข้อมูล กำหนด Role และกำหนดสิทธิ์รายโครงการ · MasterAdmin เห็นทุกโครงการ</p></div><div className="pending-count">รออนุมัติ <b>{pending}</b></div></div>
    {message && <div className="notice">{message}</div>}{error && <div className="warning">{error}</div>}
    <div className="table-scroll"><table className="users-table"><thead><tr><th>ผู้ใช้</th><th>แผนก / ตำแหน่ง</th><th>Role</th><th>สถานะ</th><th>โครงการ</th><th/></tr></thead><tbody>
      {users.map(user => <React.Fragment key={user.email}>
        <tr><td><div className="user-cell">{user.photoURL ? <img src={user.photoURL} alt=""/> : <span>{user.firstName?.[0] ?? user.email[0]?.toUpperCase()}</span>}<div><b>{`${user.firstName} ${user.lastName}`.trim() || 'ยังไม่ระบุชื่อ'}</b><small>{user.email}</small></div></div></td><td>{user.department ?? 'Other'}<small className="table-sub">{user.position || 'ยังไม่ระบุตำแหน่ง'}</small></td><td><div className="role-chips">{rolesOf(user).map(role => <span key={role}>{role}</span>)}</div></td><td><span className={`pill ${user.status === 'approved' ? 'approved' : user.status === 'rejected' ? 'rejected' : 'amber'}`}>{statusLabel(user.status)}</span></td><td>{isMasterAdminProfile(user) ? 'ทั้งหมด' : `${Object.values(user.projectPermissions ?? {}).filter(rights => rights.length > 0).length || user.assignedProjects?.length || 0} โครงการ`}</td><td><button className="text-btn" onClick={() => startEdit(user)}>แก้ไข</button></td></tr>
        {selected === user.email && <tr className="user-edit-row"><td colSpan={6}><div className="user-editor"><div className="form-grid"><label className="field"><span>ชื่อ</span><input value={String(draft.firstName ?? '')} onChange={e => setDraft({...draft, firstName: e.target.value})}/></label><label className="field"><span>นามสกุล</span><input value={String(draft.lastName ?? '')} onChange={e => setDraft({...draft, lastName: e.target.value})}/></label><label className="field"><span>ตำแหน่ง</span><input value={String(draft.position ?? '')} onChange={e => setDraft({...draft, position: e.target.value})}/></label><label className="field"><span>แผนก</span><select value={String(draft.department ?? 'Other')} onChange={e => setDraft({...draft, department: e.target.value})}>{DEPARTMENT_OPTIONS.map(department => <option key={department}>{department}</option>)}</select></label></div>
          <label className="field"><span>Role (เลือกได้หลายรายการ · Ctrl/Cmd + คลิก)</span><select className="role-multiselect" multiple value={(draft.role as UserRole[]) ?? []} onChange={updateRoleSelection}>{ROLE_OPTIONS.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
          <label className="field"><span>สถานะการใช้งาน</span><select value={draft.status} onChange={e => setDraft({...draft, status: e.target.value as UserProfile['status']})}><option value="pending">รออนุมัติ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ปฏิเสธ</option></select></label>
          <div className="field"><span>Assign Project และสิทธิ์รายโครงการ</span><div className="project-access-list">{projects.length ? projects.map(project => {const rights = (draft.projectPermissions ?? {})[project.id] ?? []; const level = permissionLevel(rights); return <div className="project-access-row" key={project.id}><label className="check-chip"><input type="checkbox" checked={rights.length > 0} onChange={() => toggleProject(project.id)}/><span>{project.name}<small>{project.code}</small></span></label>{level && <select aria-label={`สิทธิ์โครงการ ${project.name}`} value={level} onChange={e => setProjectPermission(project.id, e.target.value as ProjectPermission)}>{PROJECT_PERMISSION_OPTIONS.map(option => <option key={option} value={option}>{permissionLabel(option)}</option>)}</select>}</div>;}) : <small>ยังไม่มีโครงการให้เลือก</small>}</div><small className="help">ยกเลิกเครื่องหมายถูกเพื่อถอด Assign; สิทธิ์ “ดูอย่างเดียว” จะเปิดอ่านได้แต่บันทึกหรืออัปโหลดไม่ได้</small></div>
          <div className="editor-actions"><button className="btn" disabled={busy || !(draft.role as UserRole[] | undefined)?.length} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูลผู้ใช้'}</button><button className="btn secondary" onClick={() => setSelected(null)}>ยกเลิก</button></div>
        </div></td></tr>}
      </React.Fragment>)}
    </tbody></table></div>
  </section>;
}
