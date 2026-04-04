import { Injectable } from '@angular/core';
import { UserRole } from '../../../core/services/users.service';

export interface UserForm {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  advertiser_id: string | null;
  agency_id: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class UserValidationService {
  createEmptyForm(): UserForm {
    return {
      email: '',
      password: '',
      full_name: '',
      role: 'viewer',
      advertiser_id: null,
      agency_id: null,
    };
  }

  validateForCreate(form: UserForm): ValidationResult {
    const errors: string[] = [];

    if (!form.email.trim()) {
      errors.push('Email requis');
    }
    if (!form.full_name.trim()) {
      errors.push('Nom complet requis');
    }
    if (!form.password) {
      errors.push('Mot de passe requis');
    } else if (form.password.length < 8) {
      errors.push('Le mot de passe doit contenir au moins 8 caractères');
    }

    return { valid: errors.length === 0, errors };
  }

  validateForUpdate(form: UserForm): ValidationResult {
    const errors: string[] = [];

    if (!form.email.trim()) {
      errors.push('Email requis');
    }
    if (!form.full_name.trim()) {
      errors.push('Nom complet requis');
    }

    return { valid: errors.length === 0, errors };
  }
}
