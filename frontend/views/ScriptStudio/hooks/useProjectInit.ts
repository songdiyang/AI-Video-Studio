/**
 * 项目初始化 Hook
 * 负责加载上次选择的项目或最近的项目
 */

import { useState, useEffect, useCallback } from 'react';
import { Project, fetchProject, fetchProjects } from '../../../services/projects';
import { getWindowProjectPath, rememberProjectId, forgetLastProject } from '../../../services/windowProject';

export function useProjectInit() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    initializeProject();
  }, []);

  const initializeProject = async () => {
    try {
      // 独立窗口：优先使用本窗口绑定的工程，不读也不写主窗口的「上次工程」
      const windowPath = getWindowProjectPath();
      if (windowPath) {
        const all = await fetchProjects().catch(() => [] as Project[]);
        setSelectedProject(all.find((p) => p.local_path === windowPath) ?? null);
        setInitLoading(false);
        return;
      }

      const lastProjectId = localStorage.getItem('nanostory_last_project_id');
      
      if (lastProjectId) {
        // 尝试加载上次的工程
        try {
          const project = await fetchProject(parseInt(lastProjectId));
          if (project) {
            setSelectedProject(project);
            setInitLoading(false);
            return;
          }
        } catch (e) {
          // 上次的工程已不存在，清除记录，继续加载项目列表
          console.warn('上次工程已不存在，将加载最近的工程');
          forgetLastProject();
        }
      }
      
      // 没有上次工程记录，或上次工程已不存在，尝试加载最近的工程
      const projects = await fetchProjects();
      if (projects && projects.length > 0) {
        // 按更新时间排序，选择最近的工程
        const recentProject = projects.sort((a: Project, b: Project) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )[0];
        setSelectedProject(recentProject);
        rememberProjectId(recentProject.id);
      } else {
        // 没有任何项目，清除当前项目状态
        setSelectedProject(null);
        forgetLastProject();
      }
    } catch (error) {
      console.error('加载工程失败:', error);
      forgetLastProject();
    }
    setInitLoading(false);
  };

  const selectProject = useCallback((project: Project) => {
    setSelectedProject(project);
    rememberProjectId(project.id);
  }, []);

  return {
    selectedProject,
    setSelectedProject: selectProject,
    initLoading
  };
}
