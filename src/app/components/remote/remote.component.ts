import { HttpClient } from '@angular/common/http';
import { Component, inject, Input, OnInit } from '@angular/core';
import { Configuration } from '../../interfaces/configuration.interface';
import { Category } from '../../interfaces/category.interface';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Video } from '../../interfaces/video.interface';
import { SocketService } from '../../services/socket.service';

declare let io: any;

@Component({
  selector: 'app-remote',
  templateUrl: './remote.component.html',
  styleUrl: './remote.component.scss'
})
export class RemoteComponent implements OnInit {
  @Input() public configuration: Configuration;

  private readonly route = inject(ActivatedRoute);

  private readonly router = inject(Router);

  private readonly location = inject(Location);
  
  private readonly socketService = inject(SocketService);

  public selectedSubCategory : Category = null;

  public params: Params = null;
  
  public ngOnInit() { 
    this.route.queryParams.subscribe((params) => {
      this.params = params;
      this.selectedSubCategory = null;
      const categories = (this.params['category'] ?? '').split('+');
      console.log('show category', categories)
      for (let selectedSubCategoryId of categories) { // select sub category from query params chain
        this.selectedSubCategory = (this.selectedSubCategory?.subCategories ?? this.configuration.categories).find((subCategory) => subCategory.id === selectedSubCategoryId);
      }
    });
  }

  public goToCategory(category: Category) { // add sub category id to query params chain
    const queryParams = !this.params?.['category'] ? { category: category.id } : { category: this.params['category'] + '+' + category.id };
    console.log('go to category', queryParams)
    this.router.navigate(['/remote'], { queryParams })
  }

  public launchVideo(video: Video) {
    console.log('emit video', video);
    this.socketService.emit('command', { type: 'video', data: video });
  }

  public launchSponsors() {
    console.log('emit sponsors loop');
    this.socketService.emit('command', { type: 'sponsors' });
  }

  public back() {
    console.log('back');
    this.location.back();
  }
}
