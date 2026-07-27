import { BaseElement } from './baseElement';
import { Input } from './input';

export class Modal extends BaseElement {
    get titleInput(): Input {
        return this.generate(Input, 'input[name="title"]', { elementName: 'Title Input' });
    }
}
