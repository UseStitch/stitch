export class SkillNotFoundError extends Error {
  constructor(name: string) {
    super(`Skill "${name}" not found`);
    this.name = 'SkillNotFoundError';
  }
}

export class SkillNameCollisionError extends Error {
  constructor(name: string) {
    super(`Skill name "${name}" already exists`);
    this.name = 'SkillNameCollisionError';
  }
}

export class SkillInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillInvalidError';
  }
}

export class SkillImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillImportError';
  }
}
