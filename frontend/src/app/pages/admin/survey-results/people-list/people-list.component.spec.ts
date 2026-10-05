import { TestBed } from '@angular/core/testing';
import { answersOf } from '../../../../core/testing/answers-of';
import { PeopleListComponent, PersonRow } from './people-list.component';

describe('PeopleListComponent: a visitor among the people', () => {
  async function show(rows: PersonRow[]): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(PeopleListComponent);
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('says "Not signed in" where a person’s address is, and a person’s address as ever', async () => {
    const host = await show([
      { response: answersOf('r1', 'Zuzka', 'zuzka@example.com', false), note: null },
      { response: answersOf('r2', 'Visitor 3', '', true), note: null },
    ]);
    const people = [...host.querySelectorAll('.person')];

    expect(people[0].querySelector('.name')?.textContent).toBe('Zuzka');
    expect(people[0].querySelector('.details')?.textContent?.trim()).toBe('zuzka@example.com');
    expect(people[0].querySelector('.not-signed-in')).toBeNull();
    expect(people[1].querySelector('.name')?.textContent).toBe('Visitor 3');
    expect(people[1].querySelector('.details')?.textContent?.trim()).toBe('Not signed in');
  });

  it('takes a person without the mark (an answer from before visitors) for somebody signed in', async () => {
    const before = answersOf('r1', 'Zuzka', 'zuzka@example.com', false);
    delete before.person.visitor;
    const host = await show([{ response: before, note: null }]);

    expect(host.querySelector('.details')?.textContent?.trim()).toBe('zuzka@example.com');
  });
});
