import { Injectable, inject } from '@angular/core';
import { ApiService, toApiError } from '../api/api.service';
import { SurveyImage } from '../survey/survey.model';
import { ImageError, altFromFileName, prepareImage } from './prepare-image';

/**
 * Takes a picture in for a survey: made smaller in the browser (prepareImage),
 * sent to the server, and described as the survey will hold it - the server's
 * id, size and address, and a first description from the file's name.
 */
@Injectable({ providedIn: 'root' })
export class ImageUploader {
  private readonly _api = inject(ApiService);

  /** The picture, kept by the server; ImageError with a sentence for the editor when it cannot be. */
  async add(file: File): Promise<SurveyImage> {
    const prepared = await prepareImage(file);
    try {
      const image = await this._api.uploadImage(prepared.blob);
      return { ...image, alt: altFromFileName(file.name) };
    } catch (failure) {
      const error = toApiError(failure);
      throw new ImageError(error.status === 413 ? `"${file.name}" is larger than the server takes.` : `"${file.name}" could not be added: ${error.message}`);
    }
  }
}
