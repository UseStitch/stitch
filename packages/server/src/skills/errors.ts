class SkillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillError';
  }
}

export class SkillNotFoundError extends SkillError {
  constructor(name: string) {
    super(`Skill "${name}" not found`);
    this.name = 'SkillNotFoundError';
  }
}

export class SkillNameCollisionError extends SkillError {
  constructor(name: string) {
    super(`Skill name "${name}" already exists`);
    this.name = 'SkillNameCollisionError';
  }
}

export class SkillInvalidError extends SkillError {
  constructor(message: string) {
    super(message);
    this.name = 'SkillInvalidError';
  }
}

export class SkillImportError extends SkillError {
  constructor(message: string) {
    super(message);
    this.name = 'SkillImportError';
  }
}
