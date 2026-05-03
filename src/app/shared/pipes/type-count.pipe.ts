import { Pipe, PipeTransform } from '@angular/core';
import { ArtifactSummary } from '../../core/models/artifact.models';

@Pipe({ name: 'typeCount', standalone: true })
export class TypeCountPipe implements PipeTransform {
  transform(items: ArtifactSummary[], type: string): number {
    return items.filter(i => i.type === type).length;
  }
}
