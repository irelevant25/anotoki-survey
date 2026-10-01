import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationParams, TranslationService } from './translation.service';

/**
 * `{{ 'example.questions' | translatePlural: n }}`: the form of a plural family
 * (`.one`, `.few`, `.other`) the number asks for in the language on the page,
 * with the number as `{count}`. A third argument carries more placeholders.
 *
 * A family belongs to a place in a sentence, not to a noun: each phrase is
 * complete in its own case. A sentence with two counts is a frame key filled
 * with two such phrases -
 * `'example.size' | translate: { questions: ('example.questions' | translatePlural: n), steps: ('example.steps' | translatePlural: m) }`.
 *
 * Impure for the reason the translate pipe is: the language changes under a
 * constant key.
 */
@Pipe({ name: 'translatePlural', pure: false })
export class TranslatePluralPipe implements PipeTransform {
  private readonly _i18n = inject(TranslationService);

  transform(key: string, count: number, params?: TranslationParams): string {
    return this._i18n.plural(key, count, params);
  }
}
