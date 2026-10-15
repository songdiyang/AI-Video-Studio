import React from 'react';
import { Card, CardBody, Button } from '@heroui/react';
import { Folder, ArrowLeft } from 'lucide-react';
import { Project } from '../../services/projects';

interface ProjectInfoProps {
  project: Project;
  onBackToProjects: () => void;
}

const ProjectInfo: React.FC<ProjectInfoProps> = ({ project, onBackToProjects }) => {
  return (
    <div className="mb-4">
      <Card className="pro-card">
        <CardBody className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--accent)]/15 rounded-lg border border-[var(--accent)]/20">
              <Folder className="w-5 h-5 text-[var(--accent-light)]" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[var(--text-primary)]">{project.name}</h3>
              {project.description && (
                <p className="text-xs text-[var(--text-muted)] mt-1">{project.description}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="light"
              className="text-[var(--text-secondary)] font-semibold hover:bg-[var(--bg-card-hover)]"
              startContent={<ArrowLeft className="w-4 h-4" />}
              onPress={onBackToProjects}
            >
              切换项目
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default ProjectInfo;
