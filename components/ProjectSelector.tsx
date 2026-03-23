import React, { useState, useEffect } from 'react';
import { Card, CardBody, Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip } from '@heroui/react';
import { FolderOpen, Plus, Folder } from 'lucide-react';
import { fetchProjects, createProject, Project } from '../services/projects';
import { useToast } from '../contexts/ToastContext';

interface ProjectSelectorProps {
  onSelectProject: (project: Project) => void;
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({ onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const { showToast } = useToast();
  
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
      const projectList = await fetchProjects();
      setProjects(projectList);
    } catch (error) {
      console.error('加载项目列表失败:', error);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      showToast('请输入项目名称', 'warning');
      return;
    }

    try {
      const project = await createProject({
        name: newProjectName,
        description: newProjectDesc,
        type: 'comic_drama',
        status: 'draft'
      });
      
      setProjects([project, ...projects]);
      setNewProjectName('');
      setNewProjectDesc('');
      onOpenChange();
      onSelectProject(project);
    } catch (error: any) {
      console.error('创建项目失败:', error);
      showToast('创建项目失败，请稍后重试', 'error');
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0f] p-8">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black text-slate-100 mb-4">选择项目</h1>
          <p className="text-slate-400 text-xl">选择一个项目开始创作，或创建新项目</p>
        </div>

        {loadingProjects ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mb-4"></div>
            <p className="text-slate-400 text-lg">加载项目列表...</p>
          </div>
        ) : projects.length > 0 ? (
          <div>
            <div className="grid grid-cols-3 gap-6 mb-8">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  isPressable
                  isHoverable
                  className="cursor-pointer hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 border-2 border-slate-700/50 hover:border-blue-500/50 hover:scale-105 bg-slate-900/80 backdrop-blur-sm"
                  onPress={() => onSelectProject(project)}
                >
                  <CardBody className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-xl border border-blue-500/20">
                          <Folder className="w-7 h-7 text-blue-400" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-100">{project.name}</h3>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(project.created_at).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                      </div>
                      <Chip size="sm" variant="flat" className="bg-blue-500/10 text-blue-400 font-bold">
                        {project.status === 'draft' ? '草稿' : project.status === 'in_progress' ? '进行中' : '已完成'}
                      </Chip>
                    </div>
                    {project.description && (
                      <p className="text-sm text-slate-400 line-clamp-3 leading-relaxed">{project.description}</p>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
            <div className="text-center">
              <Button
                size="lg"
                className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-bold shadow-lg shadow-blue-500/20 px-8"
                startContent={<Plus className="w-5 h-5" />}
                onPress={onOpen}
              >
                创建新项目
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <FolderOpen className="w-32 h-32 mx-auto text-slate-600 mb-6" />
            <h3 className="text-2xl font-bold text-slate-300 mb-3">还没有项目</h3>
            <p className="text-slate-500 text-lg mb-8">创建第一个项目开始你的创作之旅</p>
            <Button
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-bold shadow-lg shadow-blue-500/20 px-8"
              startContent={<Plus className="w-5 h-5" />}
              onPress={onOpen}
            >
              创建第一个项目
            </Button>
          </div>
        )}
      </div>

      {/* 创建项目 Modal */}
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="2xl"
        classNames={{
          base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl shadow-black/40",
          header: "border-b border-slate-700/50",
          body: "py-6",
          footer: "border-t border-slate-700/50"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-slate-100 font-bold text-xl">创建新项目</ModalHeader>
              <ModalBody>
                <div className="space-y-5">
                  <Input
                    label="项目名称"
                    placeholder="输入项目名称"
                    value={newProjectName}
                    onValueChange={setNewProjectName}
                    classNames={{
                      input: "bg-transparent text-slate-100 font-semibold",
                      label: "text-slate-400 font-medium text-base",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50"
                    }}
                  />
                  <Textarea
                    label="项目描述（可选）"
                    placeholder="描述这个项目的内容和目标"
                    value={newProjectDesc}
                    onValueChange={setNewProjectDesc}
                    minRows={4}
                    classNames={{
                      input: "bg-transparent text-slate-100",
                      label: "text-slate-400 font-medium text-base",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50"
                    }}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} className="text-slate-400 font-semibold">
                  取消
                </Button>
                <Button
                  className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-bold shadow-lg shadow-blue-500/20"
                  onPress={handleCreateProject}
                >
                  创建项目
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default ProjectSelector;
